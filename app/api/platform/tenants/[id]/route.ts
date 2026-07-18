import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { requirePlatformAdmin } from "@/lib/platform-admin";

/**
 * PATCH /api/platform/tenants/[id] — platform-admin only.
 * Update a workspace's plan / trial window / storage limit.
 *
 * Body (all optional):
 *   plan          "TRIAL" | "FULL"
 *   trialDays     number  → sets trialEndsAt = now + N days (and plan TRIAL)
 *   trialEndsAt   ISO date | null → set/clear the trial end explicitly
 *   uploadLimitMb number  → per-organization storage cap in MB
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requirePlatformAdmin(req);
    const { id } = await params;

    const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new ApiError("Workspace not found", 404);

    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (body.plan !== undefined) {
      if (body.plan !== "TRIAL" && body.plan !== "FULL") {
        return apiError("plan must be TRIAL or FULL", 400);
      }
      data.plan = body.plan;
      // Granting full access clears any trial expiry.
      if (body.plan === "FULL") data.trialEndsAt = null;
    }

    if (body.trialDays !== undefined) {
      const days = Number(body.trialDays);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        return apiError("trialDays must be between 1 and 3650", 400);
      }
      data.plan = "TRIAL";
      data.trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else if (body.trialEndsAt !== undefined) {
      if (body.trialEndsAt === null) {
        data.trialEndsAt = null;
      } else {
        const d = new Date(body.trialEndsAt);
        if (isNaN(d.getTime())) return apiError("trialEndsAt is invalid", 400);
        data.trialEndsAt = d;
      }
    }

    if (body.uploadLimitMb !== undefined) {
      const mb = Number(body.uploadLimitMb);
      if (!Number.isInteger(mb) || mb < 1 || mb > 1_000_000) {
        return apiError("uploadLimitMb must be between 1 and 1,000,000", 400);
      }
      data.uploadLimitMb = mb;
    }

    if (Object.keys(data).length === 0) {
      return apiError("Nothing to update", 400);
    }

    const updated = await prisma.organization.update({
      where: { id },
      data,
      select: { id: true, name: true, plan: true, trialEndsAt: true, uploadLimitMb: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/platform/tenants/[id]");
  }
}
