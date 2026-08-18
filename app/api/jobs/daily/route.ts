import { NextRequest, NextResponse } from "next/server";
import { runDailyScan } from "@/lib/jobs";
import { apiError, handleApiError } from "@/lib/api-errors";
import { requireAuth, requireRole } from "@/lib/auth";

// POST /api/jobs/daily — run the daily scan.
// Auth: EITHER x-job-secret = JOB_SECRET (cron) OR an ADMIN session
// (the Settings "Run daily scan now" button). Admin runs use force=true so
// the dev button works repeatedly; per-notification dedupe keeps it safe.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.JOB_SECRET;
    const headerOk = !!secret && req.headers.get("x-job-secret") === secret;
    let force = false;
    if (!headerOk) {
      const user = await requireAuth(req);
      requireRole(user, ["ADMIN"]);
      force = true;
    }
    const result = await runDailyScan(new Date(), force);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/jobs/daily");
  }
}
