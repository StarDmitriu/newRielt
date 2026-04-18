import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Pool } from 'pg';
import { PostgresSupabaseClient } from './postgres-supabase.client';

dotenv.config();

@Injectable()
export class PostgresSupabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly client: PostgresSupabaseClient;

  constructor() {
    const connectionString = String(process.env.DATABASE_URL || '').trim();

    this.pool = connectionString
      ? new Pool({ connectionString })
      : new Pool({
          host: process.env.POSTGRES_HOST || process.env.PGHOST || '127.0.0.1',
          port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
          database:
            process.env.POSTGRES_DB || process.env.PGDATABASE || 'chatrassylka',
          user: process.env.POSTGRES_USER || process.env.PGUSER || 'chatrassylka',
          password:
            process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || undefined,
        });

    const storageRoot = path.join(process.cwd(), 'storage');
    const publicBaseUrl = String(
      process.env.BACKEND_PUBLIC_URL ||
        process.env.PUBLIC_API_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`,
    ).replace(/\/+$/, '');

    this.client = new PostgresSupabaseClient(
      this.pool,
      storageRoot,
      publicBaseUrl,
    );
  }

  getClient() {
    return this.client;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
