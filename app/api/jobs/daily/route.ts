import { NextRequest, NextResponse } from "next/server";
import { runDailyScan } from "@/lib/jobs";
import { apiError, handleApiError } from "@/lib/api-errors";
import { requireAuth, requireRole } from "@/lib/auth";
import { secureEquals } from "@/lib/secure-compare";

// POST /api/jobs/daily — run the daily scan.
// Auth: EITHER x-job-secret = JOB_SECRET (cron, sweeps ALL tenants) OR an ADMIN
// session (the Settings "Run daily scan now" button, scoped to THAT admin's own
// org). Admin runs use force=true so the dev button works repeatedly;
// per-notification dedupe keeps it safe.
export async function POST(req: NextRequest) {
  try {
    // QA-022: constant-time compare, and never treat a missing secret as a match.
    const headerOk = secureEquals(req.headers.get("x-job-secret"), process.env.JOB_SECRET);
    if (headerOk) {
      // Trusted platform cron — sweep every tenant.
      const result = await runDailyScan(new Date(), false);
      return NextResponse.json(result);
    }
    // QA-022: a tenant admin may run it, but ONLY for their own org — the job
    // used to sweep all tenants, so one admin's click ran everyone's scan.
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN"]);
    const result = await runDailyScan(new Date(), true, user.organizationId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/jobs/daily");
  }
}
