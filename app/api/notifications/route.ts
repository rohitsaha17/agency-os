import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// GET /api/notifications — the caller's notifications, newest first,
// plus their unread count. ?limit= caps the list (default 30, max 100).
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 30, 1), 100);

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id, organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: user.id, organizationId: user.organizationId, readAt: null },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
      unreadCount,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/notifications");
  }
}
