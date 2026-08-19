/**
 * Prisma client for standalone scripts.
 *
 * Prisma 7 requires a driver adapter, and scripts run outside Next.js so they
 * don't get .env loaded for free. Every script under scripts/ should import
 * from here rather than calling `new PrismaClient()` directly.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("No database URL found (DATABASE_URL / POSTGRES_URL).");
}

const isLocal = /(?:localhost|127\.0\.0\.1)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Close both the Prisma client and the underlying pool so the process exits. */
export async function disconnect() {
  await prisma.$disconnect();
  await pool.end();
}
