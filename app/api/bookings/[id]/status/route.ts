import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

const ACTIONS: Record<string, "CONFIRMED" | "COMPLETED" | "CANCELLED"> = {
  confirm: "CONFIRMED",
  complete: "COMPLETED",
  cancel: "CANCELLED",
};

// POST /api/bookings/[id]/status — { action: confirm|complete|cancel }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { action } = await req.json();
    const to = ACTIONS[action];
    if (!to) throw new ApiError("Invalid action", 400);

    const booking = await prisma.booking.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        client: { select: { name: true } },
        contentItem: { select: { id: true, topic: true, status: true } },
      },
    });
    if (!booking) throw new ApiError("Booking not found", 404);

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: to },
      include: {
        photographer: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        contentItem: { select: { id: true, topic: true, status: true } },
      },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "BOOKING",
      entityId: id,
      from: booking.status,
      to,
      userId: user.id,
    });
    await notifyMany(
      [booking.photographerId, booking.createdById].filter((uid) => uid !== user.id),
      {
        organizationId: user.organizationId,
        type: `BOOKING_${to}`,
        title: `Shoot ${to.toLowerCase()}${booking.client ? ` — ${booking.client.name}` : ""}`,
        body: `${booking.startAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${booking.location ? ` · ${booking.location}` : ""}`,
        link: "/bookings",
      },
    );

    // Phase-6 hook: a completed booking with a linked content item can be
    // marked delivered by the UI prompt (client calls the item status API).
    return NextResponse.json({
      ...updated,
      promptMarkItemPosted:
        to === "COMPLETED" &&
        !!booking.contentItem &&
        booking.contentItem.status !== "POSTED",
    });
  } catch (error) {
    return handleApiError(error, "POST /api/bookings/[id]/status");
  }
}
