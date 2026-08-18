import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/notifications/[id]/read — mark one of MY notifications read
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId: user.id, organizationId: user.organizationId },
      select: { id: true, readAt: true },
    });
    if (!existing) throw new ApiError("Notification not found", 404);

    if (!existing.readAt) {
      await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/notifications/[id]/read");
  }
}
