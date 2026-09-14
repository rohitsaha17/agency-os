import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getRuntimeDatabaseUrl } from "@/lib/db-url";

// Prevent multiple Prisma Client instances during Next.js hot reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * How many connections this instance may hold, decided by what it is talking
 * to. Supabase's transaction pooler answers on 6543 and is built to be given
 * many short-lived connections; anything else gets a cautious number.
 */
function poolMax(connectionString: string): number {
  const override = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(override) && override >= 1) return Math.floor(override);

  let port = "";
  try { port = new URL(connectionString).port; } catch { /* unparseable — be cautious */ }
  return port === "6543" ? 5 : 2;
}

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
    //
    // One backend per lambda instance was the conservative default, and it
    // quietly turned every Promise.all in this codebase into a queue.
    //
    // pg serialises queries over a single connection: with max 1, five
    // "parallel" queries are five round trips one after another. A database
    // round trip costs ~193ms from the function's region
    // (docs/perf/BASELINE.md), so the dashboard's 14 queries were ~2.7s of
    // waiting no amount of Promise.all could remove.
    //
    // A handful of connections per instance is what the Supabase pooler in
    // TRANSACTION mode (port 6543) is built for: it multiplexes them onto far
    // fewer real backends, so five per lambda is nothing.
    //
    // On the SESSION pooler or a direct connection (5432) each one is a real
    // Postgres backend and the ceiling is low — five per instance across a
    // dozen warm lambdas would exhaust it, and running out of connections is
    // a worse outcome than running slowly. So the port decides, rather than a
    // comment asking somebody to remember. DB_POOL_MAX overrides either way.
    max: poolMax(connectionString),

    // This was 10 seconds, to dodge a real failure: a frozen lambda holds a
    // TCP connection that Supavisor eventually reaps, and the next thaw
    // reuses a dead backend and fails with EPOOLCHECKOUT / :noproc.
    //
    // The cure was worse than the disease. Nobody clicks every ten seconds,
    // so almost every real request found an empty pool and paid a full
    // reconnect — TCP, TLS and Postgres auth, several round trips to a
    // database that is not nearby. Measured against production: a
    // primary-key lookup took 1.4s and a query against an EMPTY table took
    // 1.6s. There is no query cost in either; that was all handshake.
    //
    // keepAlive is what actually addresses the original problem. It holds
    // the TCP connection open at the socket level so idle middleboxes and
    // Supavisor don't silently drop it, which means the connection can be
    // kept for a useful length of time rather than thrown away. pg also
    // evicts a client that errors, so a genuinely dead one still can't be
    // handed out twice.
    idleTimeoutMillis: 60_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,

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

// Cached in production too, not just in dev.
//
// This used to be dev-only, which reads as the standard Next.js hot-reload
// guard — but that guard exists to stop HMR making a client per reload, and
// the same caching is what stops each server bundle making its own client and
// its own connection pool. Route handlers are split across bundles, so an
// uncached client meant several pools per instance, each paying its own
// handshake to the database.
globalForPrisma.prisma = prisma;
