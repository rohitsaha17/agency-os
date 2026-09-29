import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanUpcomingEvents } from "@/lib/reminders";
import { apiError, handleApiError } from "@/lib/api-errors";
import { secureEquals } from "@/lib/secure-compare";

// POST /api/jobs/scan-reminders — secret-header job hook (Phase 8 cron).
// Guarded by x-job-secret = process.env.JOB_SECRET.
export async function POST(req: NextRequest) {
  try {
    // QA-022: constant-time compare; a missing/empty secret is never a match.
    if (!secureEquals(req.headers.get("x-job-secret"), process.env.JOB_SECRET)) {
      return apiError("Unauthorized", 401);
    }
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    let total = 0;
    for (const org of orgs) {
      total += await scanUpcomingEvents(new Date(), org.id);
    }
    return NextResponse.json({ success: true, notificationsCreated: total });
  } catch (error) {
    return handleApiError(error, "POST /api/jobs/scan-reminders");
  }
}
