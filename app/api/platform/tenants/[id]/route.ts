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
 *   whiteLabel    boolean → chrome carries the workspace's own logo
 *   logoUrl       string | null → the workspace's logo, as a data URL or
 *                 an https link; null or "" clears it
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

    if (body.whiteLabel !== undefined) {
      if (typeof body.whiteLabel !== "boolean") {
        return apiError("whiteLabel must be a boolean", 400);
      }
      data.whiteLabel = body.whiteLabel;
    }

    if (body.logoUrl !== undefined) {
      const raw = body.logoUrl;
      if (raw === null || raw === "") {
        data.logoUrl = null;
      } else if (typeof raw !== "string") {
        return apiError("logoUrl must be a string, or null to clear it", 400);
      } else {
        // The value is rendered straight into an <img src> in the tenant's
        // own chrome, so only the two shapes that can legitimately appear
        // there are accepted. Anything else - javascript:, blob:, a bare
        // path - is refused rather than stored and puzzled over later.
        const ok = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(raw)
          || /^https:\/\//i.test(raw);
        if (!ok) {
          return apiError("logoUrl must be an image data URL or an https:// link", 400);
        }
        // 1.5 MB of image, which is ~1.34x that once base64'd. The same
        // ceiling the tenant's own settings page enforces, so a logo cannot
        // arrive by one door that would have been refused at the other.
        if (raw.length > 2_100_000) {
          return apiError("Logo is too large. Use an image under 1.5 MB.", 400);
        }
        data.logoUrl = raw;
      }
    }

    if (Object.keys(data).length === 0) {
      return apiError("Nothing to update", 400);
    }

    const updated = await prisma.organization.update({
      where: { id },
      data,
      select: {
        id: true, name: true, plan: true, trialEndsAt: true,
        uploadLimitMb: true, whiteLabel: true, logoUrl: true,
      },
    });

    // The logo itself can be a megabyte of base64; the admin table only ever
    // asks whether there is one. Send the answer, not the payload.
    const { logoUrl, ...rest } = updated;
    return NextResponse.json({ ...rest, hasLogo: !!logoUrl });
  } catch (error) {
    return handleApiError(error, "PATCH /api/platform/tenants/[id]");
  }
}
