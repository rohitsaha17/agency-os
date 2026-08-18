import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// POST /api/notifications/read-all — mark all MY notifications read
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    await prisma.notification.updateMany({
      where: { userId: user.id, organizationId: user.organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "POST /api/notifications/read-all");
  }
}
