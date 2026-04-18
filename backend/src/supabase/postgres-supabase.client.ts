import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { Pool, QueryResultRow } from 'pg';

type SupabaseResult<T> = {
  data: T | null;
  error: Error | null;
};

type OrderConfig = {
  column: string;
  ascending: boolean;
};

type Filter =
  | { type: 'eq' | 'neq' | 'gte' | 'lte'; column: string; value: unknown }
  | { type: 'in'; column: string; value: unknown[] }
  | { type: 'not'; column: string; operator: string; value: unknown };

type MutationType = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

type SelectShape = {
  columns: string[] | null;
  includeAll: boolean;
  relations: string[];
};

function normalizeColumnName(value: string): string {
  return value.trim().replace(/^"+|"+$/g, '');
}

function quoteIdentifier(value: string): string {
  return `"${normalizeColumnName(value).replace(/"/g, '""')}"`;
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of input) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelectShape(selection?: string): SelectShape {
  if (!selection || selection.trim() === '*' || selection.trim() === '') {
    return { columns: null, includeAll: true, relations: [] };
  }

  const columns: string[] = [];
  const relations: string[] = [];

  for (const token of splitTopLevel(selection)) {
    const relationMatch = token.match(/^([a-zA-Z0-9_]+)\(\*\)$/);
    if (relationMatch) {
      relations.push(relationMatch[1]);
      continue;
    }

    columns.push(normalizeColumnName(token));
  }

  return {
    columns: columns.length ? columns : null,
    includeAll: columns.length === 0,
    relations,
  };
}

class StorageBucketClient {
  constructor(
    private readonly bucket: string,
    private readonly storageRoot: string,
    private readonly publicBaseUrl: string,
  ) {}

  async upload(
    filePath: string,
    payload: Buffer,
    _options?: { contentType?: string; upsert?: boolean },
  ): Promise<SupabaseResult<null>> {
    try {
      const targetPath = path.join(this.storageRoot, this.bucket, filePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, payload);
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  getPublicUrl(filePath: string) {
    const safePath = filePath
      .split(/[\\/]+/)
      .map((part) => encodeURIComponent(part))
      .join('/');

    return {
      data: {
        publicUrl: `${this.publicBaseUrl}/media/${encodeURIComponent(this.bucket)}/${safePath}`,
      },
    };
  }
}

class StorageClient {
  constructor(
    private readonly storageRoot: string,
    private readonly publicBaseUrl: string,
  ) {}

  from(bucket: string) {
    return new StorageBucketClient(bucket, this.storageRoot, this.publicBaseUrl);
  }
}

class QueryBuilder<T extends QueryResultRow = QueryResultRow>
  implements PromiseLike<SupabaseResult<T | T[]>>
{
  private action: MutationType = 'select';
  private selection?: string;
  private filters: Filter[] = [];
  private orders: OrderConfig[] = [];
  private rowLimit?: number;
  private insertRows: Record<string, unknown>[] = [];
  private updatePatch: Record<string, unknown> = {};
  private conflictColumns: string[] = [];
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(
    private readonly pool: Pool,
    private readonly table: string,
  ) {}

  select(selection = '*') {
    this.selection = selection;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = 'insert';
    this.insertRows = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update';
    this.updatePatch = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) {
    this.action = 'upsert';
    this.insertRows = Array.isArray(payload) ? payload : [payload];
    this.conflictColumns = String(options?.onConflict || '')
      .split(',')
      .map((item) => normalizeColumnName(item))
      .filter(Boolean);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ type: 'in', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ type: 'not', column, operator, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.mode = 'single';
    return this;
  }

  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  then<TResult1 = SupabaseResult<T | T[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult<T | T[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhereClause(values: unknown[]) {
    if (!this.filters.length) return '';

    const parts = this.filters.map((filter) => {
      const column = quoteIdentifier(filter.column);

      if (filter.type === 'not') {
        if (filter.operator === 'is' && filter.value === null) {
          return `${column} IS NOT NULL`;
        }
        throw new Error(`Unsupported .not() operator: ${filter.operator}`);
      }

      if (filter.type === 'in') {
        values.push(filter.value);
        return `${column} = ANY($${values.length})`;
      }

      const operatorMap: Record<string, string> = {
        eq: '=',
        neq: '!=',
        gte: '>=',
        lte: '<=',
      };

      values.push(filter.value);
      return `${column} ${operatorMap[filter.type]} $${values.length}`;
    });

    return ` WHERE ${parts.join(' AND ')}`;
  }

  private buildOrderClause() {
    if (!this.orders.length) return '';

    const fragments = this.orders.map(
      (item) =>
        `${quoteIdentifier(item.column)} ${item.ascending ? 'ASC' : 'DESC'}`,
    );
    return ` ORDER BY ${fragments.join(', ')}`;
  }

  private buildLimitClause() {
    return Number.isFinite(this.rowLimit) ? ` LIMIT ${this.rowLimit}` : '';
  }

  private async executeSelect() {
    const values: unknown[] = [];
    const selectShape = parseSelectShape(this.selection);
    const columnSql =
      selectShape.includeAll || !selectShape.columns?.length
        ? '*'
        : selectShape.columns.map(quoteIdentifier).join(', ');

    const sql =
      `SELECT ${columnSql} FROM ${quoteIdentifier(this.table)}` +
      this.buildWhereClause(values) +
      this.buildOrderClause() +
      this.buildLimitClause();

    const result = await this.pool.query<T>(sql, values);
    const rows = await this.attachRelations(result.rows, selectShape.relations);
    return this.finalize(rows);
  }

  private buildReturningClause() {
    if (!this.selection) return '';
    const selectShape = parseSelectShape(this.selection);
    if (selectShape.includeAll || !selectShape.columns?.length) return ' RETURNING *';
    return ` RETURNING ${selectShape.columns.map(quoteIdentifier).join(', ')}`;
  }

  private async executeInsertLike(action: 'insert' | 'upsert') {
    if (!this.insertRows.length) {
      return { data: null, error: null };
    }

    const columns = Array.from(
      new Set(this.insertRows.flatMap((row) => Object.keys(row))),
    );
    const values: unknown[] = [];

    const valuesSql = this.insertRows
      .map((row) => {
        const tuple = columns.map((column) => {
          values.push(row[column] ?? null);
          return `$${values.length}`;
        });
        return `(${tuple.join(', ')})`;
      })
      .join(', ');

    let sql =
      `INSERT INTO ${quoteIdentifier(this.table)} (` +
      columns.map(quoteIdentifier).join(', ') +
      `) VALUES ${valuesSql}`;

    if (action === 'upsert') {
      if (!this.conflictColumns.length) {
        throw new Error(`Missing onConflict columns for upsert on ${this.table}`);
      }

      const updateColumns = columns.filter(
        (column) => !this.conflictColumns.includes(column),
      );

      const updateSql = updateColumns.length
        ? updateColumns
            .map(
              (column) =>
                `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`,
            )
            .join(', ')
        : `${quoteIdentifier(this.conflictColumns[0])} = EXCLUDED.${quoteIdentifier(this.conflictColumns[0])}`;

      sql +=
        ` ON CONFLICT (${this.conflictColumns.map(quoteIdentifier).join(', ')})` +
        ` DO UPDATE SET ${updateSql}`;
    }

    sql += this.buildReturningClause();

    const result = await this.pool.query<T>(sql, values);
    return this.finalize(result.rows);
  }

  private async executeUpdate() {
    const columns = Object.keys(this.updatePatch);
    if (!columns.length) {
      return { data: null, error: null };
    }

    const values: unknown[] = [];
    const setSql = columns
      .map((column) => {
        values.push(this.updatePatch[column] ?? null);
        return `${quoteIdentifier(column)} = $${values.length}`;
      })
      .join(', ');

    const sql =
      `UPDATE ${quoteIdentifier(this.table)} SET ${setSql}` +
      this.buildWhereClause(values) +
      this.buildReturningClause();

    const result = await this.pool.query<T>(sql, values);
    return this.finalize(result.rows);
  }

  private async executeDelete() {
    const values: unknown[] = [];
    const sql =
      `DELETE FROM ${quoteIdentifier(this.table)}` +
      this.buildWhereClause(values) +
      this.buildReturningClause();

    const result = await this.pool.query<T>(sql, values);
    return this.finalize(result.rows);
  }

  private async attachRelations<TItem extends QueryResultRow>(
    rows: TItem[],
    relations: string[],
  ) {
    if (!rows.length || !relations.length) return rows;

    const output = rows.map((row) => ({ ...row })) as Array<TItem & Record<string, unknown>>;

    if (this.table === 'users' && relations.includes('subscriptions')) {
      const ids = output.map((row) => row.id).filter(Boolean);
      if (ids.length) {
        const relationRows = await this.pool.query(
          `SELECT * FROM "subscriptions" WHERE "user_id" = ANY($1::uuid[])`,
          [ids],
        );

        const byUserId = new Map<string, any[]>();
        for (const relationRow of relationRows.rows) {
          const key = String(relationRow.user_id);
          const current = byUserId.get(key) ?? [];
          current.push(relationRow);
          byUserId.set(key, current);
        }

        for (const row of output) {
          row.subscriptions = byUserId.get(String(row.id)) ?? [];
        }
      }
    }

    return output;
  }

  private finalize(rows: T[]) {
    if (this.mode === 'many') {
      return { data: rows, error: null } as SupabaseResult<T[]>;
    }

    if (this.mode === 'single') {
      if (rows.length !== 1) {
        return {
          data: null,
          error: new Error(`Expected exactly one row from ${this.table}, got ${rows.length}`),
        } as SupabaseResult<T>;
      }

      return { data: rows[0], error: null } as SupabaseResult<T>;
    }

    if (rows.length > 1) {
      return {
        data: null,
        error: new Error(`Expected zero or one row from ${this.table}, got ${rows.length}`),
      } as SupabaseResult<T>;
    }

    return { data: rows[0] ?? null, error: null } as SupabaseResult<T>;
  }

  private async execute(): Promise<SupabaseResult<T | T[]>> {
    try {
      switch (this.action) {
        case 'select':
          return await this.executeSelect();
        case 'insert':
          return await this.executeInsertLike('insert');
        case 'upsert':
          return await this.executeInsertLike('upsert');
        case 'update':
          return await this.executeUpdate();
        case 'delete':
          return await this.executeDelete();
        default:
          throw new Error(`Unsupported action: ${this.action}`);
      }
    } catch (error) {
      return {
        data: null,
        error: error as Error,
      };
    }
  }
}

export class PostgresSupabaseClient {
  readonly storage: StorageClient;

  constructor(
    private readonly pool: Pool,
    storageRoot: string,
    publicBaseUrl: string,
  ) {
    this.storage = new StorageClient(storageRoot, publicBaseUrl);
  }

  from<T extends QueryResultRow = QueryResultRow>(table: string) {
    return new QueryBuilder<T>(this.pool, table);
  }
}

