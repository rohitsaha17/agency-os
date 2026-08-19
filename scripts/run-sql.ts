/**
 * Run a .sql file against DATABASE_URL.
 *
 * The embedded Postgres used for local dev ships no psql binary, and the
 * checked-in prisma/migrations history can't be replayed, so schema changes
 * live in prisma/manual-migrations/*.sql and are applied with this.
 *
 *   npx tsx scripts/run-sql.ts prisma/manual-migrations/<file>.sql
 *
 * The whole file is sent as one statement batch, so a script that manages its
 * own BEGIN/COMMIT works as written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/run-sql.ts <path-to.sql>");
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
if (!connectionString) {
  console.error("No DATABASE_URL found.");
  process.exit(1);
}

const isLocal = /(?:localhost|127\.0\.0\.1)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

(async () => {
  const path = resolve(process.cwd(), file);
  const sql = readFileSync(path, "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`✓ Applied ${file}`);
  } catch (e) {
    console.error(`✗ Failed ${file}`);
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
