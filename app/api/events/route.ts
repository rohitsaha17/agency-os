import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { ensureFestivalPack } from "@/lib/reminders";

const KINDS = ["FESTIVAL", "CAMPAIGN", "SHOOT", "INTERNAL", "OTHER"] as const;

// GET /api/events?from&to — org events (festival pack lazy-seeded)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    await ensureFestivalPack(user.organizationId);
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");

    const events = await prisma.calendarEvent.findMany({
      where: {
        organizationId: user.organizationId,
        ...(from && to && {
          OR: [
            { date: { gte: new Date(from), lt: new Date(to) } },
            { endDate: { gte: new Date(from), lt: new Date(to) } },
          ],
        }),
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(events);
  } catch (error) {
    return handleApiError(error, "GET /api/events");
  }
}

// POST /api/events — add an event
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { title, date, endDate, kind, clientId, reminderDaysBefore, isAdHoc, notes } = await req.json();
    if (!title?.trim()) throw new ApiError("Title is required", 400);
    if (!date || isNaN(new Date(date).getTime())) throw new ApiError("A valid date is required", 400);
    if (kind && !KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!client) throw new ApiError("Client not found", 404);
    }

    const event = await prisma.calendarEvent.create({
      data: {
        organizationId: user.organizationId,
        title: title.trim(),
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        kind: kind ?? "OTHER",
        clientId: clientId || null,
        reminderDaysBefore: reminderDaysBefore != null && reminderDaysBefore !== "" ? parseInt(reminderDaysBefore, 10) : null,
        isAdHoc: !!isAdHoc,
        notes: notes?.trim() || null,
        createdById: user.id,
      },
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/events");
  }
}
