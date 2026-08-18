import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanUpcomingEvents } from "@/lib/reminders";
import { apiError, handleApiError } from "@/lib/api-errors";

// POST /api/jobs/scan-reminders — secret-header job hook (Phase 8 cron).
// Guarded by x-job-secret = process.env.JOB_SECRET.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.JOB_SECRET;
    if (!secret || req.headers.get("x-job-secret") !== secret) {
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
