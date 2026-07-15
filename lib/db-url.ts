/**
 * Resolve the Postgres connection URL from whichever env var is set.
 *
 * Falls back through Vercel + Supabase auto-injected names so the app
 * works regardless of how the DB was connected:
 *
 *   1. DATABASE_URL              — the standard name
 *   2. POSTGRES_PRISMA_URL       — Vercel-Supabase pooled URL (has ?pgbouncer=true)
 *   3. POSTGRES_URL_NON_POOLING  — Vercel-Supabase direct URL (port 5432)
 *   4. POSTGRES_URL              — Vercel Postgres / Supabase pooled URL
 *
 * Runtime queries prefer the pooled URL (better under high concurrency).
 * `prisma db push` / `migrate` prefer the NON_POOLING URL — pgbouncer's
 * transaction pooler doesn't support DDL statements.
 */

/** URL to use for regular runtime PrismaClient queries. */
export function getRuntimeDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    ""
  );
}

/** URL to use for schema migrations / `prisma db push`. */
export function getMigrationDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    ""
  );
}
