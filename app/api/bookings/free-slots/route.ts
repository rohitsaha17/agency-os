import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// GET /api/bookings/free-slots?hours=2 — next free slots today/tomorrow per
// photographer (working window 09:00–19:00), avoiding existing bookings.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const hours = Math.min(Math.max(parseFloat(req.nextUrl.searchParams.get("hours") ?? "2") || 2, 0.5), 10);
    const durMs = hours * 3600000;

    const photographers = await prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true, designation: "PHOTOGRAPHER" },
      select: { id: true, name: true },
    });
    if (photographers.length === 0) {
      throw new ApiError("No photographers yet — set designation = Photographer in Settings → Users", 400);
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + 2 * 86400000);
    const bookings = await prisma.booking.findMany({
      where: {
        organizationId: user.organizationId,
        photographerId: { in: photographers.map((p) => p.id) },
        status: { in: ["REQUESTED", "CONFIRMED"] },
        endAt: { gt: now },
        startAt: { lt: horizon },
      },
      select: { photographerId: true, startAt: true, endAt: true },
    });

    const slots: { photographerId: string; photographerName: string; startAt: string; endAt: string }[] = [];
    for (const p of photographers) {
      const mine = bookings
        .filter((b) => b.photographerId === p.id)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
      let found = 0;
      for (let day = 0; day < 2 && found < 3; day++) {
        const base = new Date(now);
        base.setDate(base.getDate() + day);
        const dayStart = new Date(base); dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(base); dayEnd.setHours(19, 0, 0, 0);
        let cursor = day === 0 && now > dayStart ? new Date(Math.ceil(now.getTime() / 1800000) * 1800000) : dayStart;
        while (cursor.getTime() + durMs <= dayEnd.getTime() && found < 3) {
          const end = new Date(cursor.getTime() + durMs);
          const clash = mine.find((b) => b.startAt < end && b.endAt > cursor);
          if (clash) {
            cursor = new Date(clash.endAt);
            continue;
          }
          slots.push({
            photographerId: p.id,
            photographerName: p.name,
            startAt: cursor.toISOString(),
            endAt: end.toISOString(),
          });
          found++;
          cursor = new Date(cursor.getTime() + durMs);
        }
      }
    }
    return NextResponse.json(slots);
  } catch (error) {
    return handleApiError(error, "GET /api/bookings/free-slots");
  }
}
