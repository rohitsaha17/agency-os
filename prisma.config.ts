import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Load .env locally — silently no-op on hosted runners (Vercel/Railway)
// where env vars are injected directly and no .env file exists.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Resolve the Postgres connection URL from whichever env var is set.
 *
 * `prisma db push` / `migrate` need a DIRECT connection (not pgbouncer)
 * because DDL statements aren't compatible with transaction pooling.
 * Order matches that requirement:
 *
 *   1. DATABASE_URL              — the standard name (assume user set correctly)
 *   2. POSTGRES_URL_NON_POOLING  — Vercel-Supabase direct URL (port 5432)
 *   3. POSTGRES_URL              — Vercel Postgres / Supabase pooled URL
 *   4. POSTGRES_PRISMA_URL       — Vercel-Supabase pooled URL (has ?pgbouncer=true)
 */
function resolveMigrationUrl(): string {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    ""
  );
}

// Prisma 7 requires `datasource.url` to be a literal in the exported
// config for migrate / db push. Empty-string fallback keeps `prisma
// generate` during install crash-free; if the URL is empty when a
// migrate command actually needs it, Prisma throws a clear
// "Connection url is empty" error pointing at the real problem.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: resolveMigrationUrl(),
  },
});
