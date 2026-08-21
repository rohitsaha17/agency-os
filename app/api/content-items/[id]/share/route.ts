import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// POST /api/content-items/[id]/share — generate a public review link
// (TEAM_APPROVED items only; default expiry 14 days).
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;
    const item = await prisma.contentItem.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!item) throw new ApiError("Content item not found", 404);
    if (item.status !== "TEAM_APPROVED") {
      throw new ApiError("Only team-approved items can be shared for client approval", 400);
    }

    const token = randomBytes(24).toString("hex");
    const updated = await prisma.contentItem.update({
      where: { id },
      data: {
        reviewToken: token,
        reviewTokenExpiresAt: new Date(Date.now() + 14 * 86400000),
      },
      select: { reviewToken: true, reviewTokenExpiresAt: true },
    });
    return NextResponse.json({ url: `/review/${updated.reviewToken}`, expiresAt: updated.reviewTokenExpiresAt });
  } catch (error) {
    return handleApiError(error, "POST /api/content-items/[id]/share");
  }
}

// DELETE — revoke the link
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;
    const item = await prisma.contentItem.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!item) throw new ApiError("Content item not found", 404);
    await prisma.contentItem.update({
      where: { id },
      data: { reviewToken: null, reviewTokenExpiresAt: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/content-items/[id]/share");
  }
}
