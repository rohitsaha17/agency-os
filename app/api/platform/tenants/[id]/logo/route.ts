import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { requirePlatformAdmin } from "@/lib/platform-admin";

/**
 * GET /api/platform/tenants/[id]/logo — platform-admin only.
 *
 * One workspace's logo, fetched only when somebody opens that workspace's
 * branding panel.
 *
 * It has a route of its own because the value is a data URL and can run to a
 * megabyte of base64. Putting it in the tenants list would have meant sending
 * every tenant's logo to render a table that shows none of them; the list
 * reports hasLogo instead, and this answers the one case where the bytes are
 * actually wanted — looking at the logo before deciding whether it reads on
 * dark chrome.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requirePlatformAdmin(req);
    const { id } = await params;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { logoUrl: true },
    });
    if (!org) throw new ApiError("Workspace not found", 404);

    return NextResponse.json({ logoUrl: org.logoUrl });
  } catch (error) {
    return handleApiError(error, "GET /api/platform/tenants/[id]/logo");
  }
}
