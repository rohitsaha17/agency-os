/**
 * Drop every table in the `public` schema of the target Postgres database
 * (plus their sequences, indexes, and enums). The idea is to leave the DB
 * empty of user objects so a subsequent `prisma db push` can create a fresh
 * multi-tenant schema without foreign-key or "column already exists" errors.
 *
 * USE ON PRODUCTION DBS ONLY WHEN YOU MEAN IT. Everything is destroyed.
 *
 * Recommended flow — three commands in order:
 *   export DATABASE_URL="<paste remote connection string from Vercel>"
 *   npx tsx scripts/reset-remote.ts        # drops all tables
 *   npx prisma db push                     # creates fresh multi-tenant schema
 *   npx tsx scripts/wipe-and-seed-org.ts   # seeds My Agency + Anshul (OWNER)
 *
 * The script prints the target host and database name up-front so you can
 * abort with ^C before anything is destroyed.
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { URL } from "node:url";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const parsed = new URL(url);
console.log("→ Target database:");
console.log(`  host:     ${parsed.hostname}`);
console.log(`  database: ${parsed.pathname.slice(1)}`);
console.log(`  user:     ${parsed.username}`);
console.log("  (aborting? press ^C now — resuming in 4s)");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await sleep(4000);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    console.log("→ Dropping the entire public schema…");
    // Nuclear: drop the whole public schema and recreate it. This removes
    // tables, indexes, sequences, enums, functions — everything, including
    // any Supabase template tables (e.g. a `public.audit_log` that points
    // at `auth.users` and blocks `prisma db push` with error P4002).
    // Supabase's own machinery lives in the auth/storage/realtime schemas,
    // NOT public, so this is safe.
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    console.log("  ✓ public schema recreated (empty)");

    // Restore standard grants. `postgres` owns the schema (it created it),
    // and we re-grant the Supabase service roles if they exist so the
    // project's API/dashboard keep working. Guarded so this also runs fine
    // against a plain Postgres that lacks those roles.
    console.log("→ Restoring schema grants…");
    await client.query("GRANT ALL ON SCHEMA public TO postgres");
    await client.query("GRANT USAGE ON SCHEMA public TO public");
    await client.query(`
      DO $$
      DECLARE r text;
      BEGIN
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', r);
          END IF;
        END LOOP;
      END $$;
    `);
    console.log("  ✓ grants restored");

    console.log("\n✓ Done. Next steps:");
    console.log("  npx prisma db push");
    console.log("  npx tsx scripts/wipe-and-seed-org.ts");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗ Failed:", e);
  process.exit(1);
});
