import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { handleApiError } from "@/lib/api-errors";

/**
 * GET /api/platform/perf — what the database actually costs from here.
 *
 * Performance work on a serverless deploy is mostly guessing unless you can
 * see two things from outside: how far the database is, and whether queries
 * that are written to run in parallel actually do.
 *
 * Neither is visible from a normal endpoint. Every real route needs a login,
 * and every real route's timing mixes query cost with auth, permissions and
 * serialisation. So this measures the two things directly:
 *
 *   oneQuery   — a trivial `SELECT 1` round trip. This is the number that
 *                decides everything else: at the time of writing it was
 *                193ms with the function in iad1 (docs/perf/BASELINE.md).
 *   fiveSerial — the same query five times, awaited one after another.
 *   fiveParallel — the same five in a Promise.all.
 *
 * If fiveParallel ≈ oneQuery, the pool is wide enough and Promise.all means
 * what it says. If fiveParallel ≈ fiveSerial, it does not: pg serialises over
 * a single connection, so with max 1 every parallel group in the codebase is
 * a queue wearing a costume. That was true here until `poolMax` in
 * lib/prisma.ts started deciding by pooler port.
 *
 * Behind the platform admin key, not because the numbers are secret — they
 * are timings of `SELECT 1` — but because an unauthenticated endpoint that
 * makes eleven database round trips is a free lever for someone else to pull.
 */
export async function GET(req: NextRequest) {
  try {
    requirePlatformAdmin(req);

    const ping = () => prisma.$queryRaw`SELECT 1`;
    const time = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      await fn();
      return Date.now() - t;
    };

    // Warm the pool first, so the first measurement isn't a TLS handshake.
    await ping();

    const oneQuery = await time(ping);
    const fiveSerial = await time(async () => {
      for (let i = 0; i < 5; i++) await ping();
    });
    const fiveParallel = await time(() => Promise.all([ping(), ping(), ping(), ping(), ping()]));

    let port = "";
    try { port = new URL(process.env.DATABASE_URL ?? "").port; } catch { /* ignore */ }

    return NextResponse.json({
      // Host and credentials are deliberately absent — only the port class,
      // which is what decides the pool size.
      pooler: port === "6543" ? "transaction (6543)" : port === "5432" ? "session or direct (5432)" : "unknown",
      poolMax: Number(process.env.DB_POOL_MAX) || (port === "6543" ? 5 : 2),
      region: process.env.VERCEL_REGION ?? "unknown",
      ms: { oneQuery, fiveSerial, fiveParallel },
      parallelismWorking: fiveParallel < fiveSerial * 0.6,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/platform/perf");
  }
}
