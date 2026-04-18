## First server bootstrap

1. Copy `.env.postgres.example` to `.env.postgres` and set a real password.
2. For the very first launch without SSL, temporarily use `deploy/nginx/bootstrap.conf`
   instead of `deploy/nginx/default.conf`.
3. Start infrastructure:

```bash
docker compose up -d postgres redis
docker compose logs -f postgres
```

4. When PostgreSQL finishes initialization, the SQL files from `newBd/` will be
   imported automatically on the first startup into the new `pg_data` volume.

## Important limitation

The backend code still uses Supabase directly. PostgreSQL is now prepared at the
infrastructure level, but the application will not fully work against this new
database until the backend is migrated from Supabase to direct PostgreSQL access.
