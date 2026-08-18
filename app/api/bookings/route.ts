import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";

const BOOKING_INCLUDE = {
  photographer: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  contentItem: { select: { id: true, topic: true, status: true } },
} as const;

// GET /api/bookings?from&to — org bookings in range
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");

    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: user.organizationId,
        ...(from && to && { startAt: { gte: new Date(from), lt: new Date(to) } }),
      },
      include: BOOKING_INCLUDE,
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json(bookings);
  } catch (error) {
    return handleApiError(error, "GET /api/bookings");
  }
}

// POST /api/bookings — create with SERVER-side overlap check per
// photographer. Overlap → 409 { conflict } unless bookAnyway by
// ADMIN/MANAGER/OWNER.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const {
      photographerId, clientId, projectId, contentItemId,
      startAt, endAt, location, notes, isAdHoc, bookAnyway,
    } = await req.json();

    if (!photographerId) throw new ApiError("Photographer is required", 400);
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new ApiError("A valid time range is required", 400);
    }

    const photographer = await prisma.user.findFirst({
      where: { id: photographerId, organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true },
    });
    if (!photographer) throw new ApiError("Photographer not found", 404);

    // Overlap check (REQUESTED/CONFIRMED block the slot)
    const conflict = await prisma.booking.findFirst({
      where: {
        organizationId: user.organizationId,
        photographerId,
        status: { in: ["REQUESTED", "CONFIRMED"] },
        startAt: { lt: end },
        endAt: { gt: start },
      },
      include: { client: { select: { name: true } } },
    });
    if (conflict) {
      const canOverride = ["ADMIN", "OWNER", "MANAGER"].includes(user.role);
      if (!bookAnyway || !canOverride) {
        return NextResponse.json(
          {
            error: { message: "This photographer is already booked in that slot", code: "CONFLICT" },
            conflict: {
              id: conflict.id,
              startAt: conflict.startAt.toISOString(),
              endAt: conflict.endAt.toISOString(),
              clientName: conflict.client?.name ?? null,
              location: conflict.location,
              canOverride,
            },
          },
          { status: 409 },
        );
      }
    }

    const booking = await prisma.booking.create({
      data: {
        organizationId: user.organizationId,
        photographerId,
        clientId: clientId || null,
        projectId: projectId || null,
        contentItemId: contentItemId || null,
        startAt: start,
        endAt: end,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        isAdHoc: !!isAdHoc,
        createdById: user.id,
      },
      include: BOOKING_INCLUDE,
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "BOOKING",
      entityId: booking.id,
      from: null,
      to: "REQUESTED",
      userId: user.id,
      note: conflict ? "booked over a conflict (override)" : "requested",
    });
    if (photographerId !== user.id) {
      await notify({
        organizationId: user.organizationId,
        userId: photographerId,
        type: "BOOKING_REQUESTED",
        title: `New shoot booking ${booking.client ? `for ${booking.client.name}` : ""}`,
        body: `${start.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${location ? ` · ${location}` : ""}`,
        link: "/bookings",
      });
    }
    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/bookings");
  }
}
