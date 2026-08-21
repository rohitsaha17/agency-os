import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getRuntimeDatabaseUrl } from "@/lib/db-url";

// Prevent multiple Prisma Client instances during Next.js hot reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // DATABASE_URL only. Throws, naming the variable, if it isn't set —
  // see lib/db-url.ts for why the POSTGRES_* fallbacks were removed.
  const connectionString = getRuntimeDatabaseUrl();

  // Local Postgres (localhost / 127.0.0.1) doesn't use TLS; remote hosts
  // like Supabase require it. Only enable SSL for non-local hosts so local
  // dev keeps working.
  const isLocal = /(?:localhost|127\.0\.0\.1)/.test(connectionString);

  const pool = new Pool({
    connectionString,
    // ── Serverless (Vercel) + Supabase pooler (Supavisor) tuning ──
    // A frozen lambda holds open TCP connections that Supavisor eventually
    // reaps; a later thaw then tries to reuse a dead backend and fails with
    // EPOOLCHECKOUT / :noproc. Keeping the local pool tiny and releasing
    // idle connections quickly makes us re-establish fresh connections
    // instead of reusing stale ones.
    max: 1, // one backend per lambda instance — pooler multiplexes the rest
    idleTimeoutMillis: 10_000, // drop idle conns before Supavisor reaps them
    connectionTimeoutMillis: 15_000, // fail fast instead of hanging 30s
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
