import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { ensureFestivalPack, scanUpcomingEvents } from "@/lib/reminders";

/**
 * GET /api/master-calendar?year&month&clientId&projectId&creativeTypeId&
 *   status&assigneeId&extraOnly&adHocOnly
 *
 * The org-wide content view. Access filtering IS here (docs/V2_CONTEXT.md §4):
 * ADMIN/MANAGER/OWNER see everything; MEMBERs see only content items with a
 * linked task assigned to them (plus org-wide events). No financial fields.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const year = parseInt(sp.get("year") ?? "", 10);
    const month = parseInt(sp.get("month") ?? "", 10); // 1-based
    if (!year || !month) throw new ApiError("year and month are required", 400);

    const from = new Date(Date.UTC(year, month - 1, -7));
    const to = new Date(Date.UTC(year, month, 7));

    const clientId = sp.get("clientId") ?? undefined;
    const projectId = sp.get("projectId") ?? undefined;
    const creativeTypeId = sp.get("creativeTypeId") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const assigneeId = sp.get("assigneeId") ?? undefined;
    const extraOnly = sp.get("extraOnly") === "1";
    const adHocOnly = sp.get("adHocOnly") === "1";

    const isMember = user.role === "MEMBER";

    const [items, events] = await Promise.all([
      prisma.contentItem.findMany({
        where: {
          organizationId: user.organizationId,
          date: { gte: from, lt: to },
          ...(clientId && { clientId }),
          ...(projectId && { projectId }),
          ...(creativeTypeId && { creativeTypeId }),
          ...(status && { status: status as never }),
          ...(extraOnly && { isExtra: true }),
          ...(adHocOnly && { isAdHoc: true }),
          ...(assigneeId && {
            tasks: { some: { deletedAt: null, assignees: { some: { userId: assigneeId } } } },
          }),
          // Access rule: members only see items with a task assigned to them
          ...(isMember && {
            tasks: { some: { deletedAt: null, assignees: { some: { userId: user.id } } } },
          }),
        },
        select: {
          id: true, clientId: true, projectId: true, date: true, topic: true,
          status: true, isExtra: true, isAdHoc: true, carriedFromId: true,
          client: { select: { id: true, name: true } },
          creativeType: { select: { id: true, name: true, icon: true, color: true } },
          tasks: {
            where: { deletedAt: null },
            select: {
              id: true, status: true,
              assignees: { select: { user: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { date: "asc" },
      }),
      (async () => {
        await ensureFestivalPack(user.organizationId);
        return prisma.calendarEvent.findMany({
          where: {
            organizationId: user.organizationId,
            OR: [
              { date: { gte: from, lt: to } },
              { endDate: { gte: from, lt: to } },
            ],
            // Members: org-wide events only
            ...(user.role === "MEMBER" ? { clientId: null } : {}),
          },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { date: "asc" },
        });
      })(),
    ]);

    // Fire due reminders opportunistically (idempotent) — Phase 8 moves this
    // to the daily job.
    scanUpcomingEvents(new Date(), user.organizationId).catch(() => {});

    return NextResponse.json({
      items: items.map((i) => ({ ...i, date: i.date.toISOString() })),
      events: events.map((e) => ({
        ...e,
        date: e.date.toISOString(),
        endDate: e.endDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/master-calendar");
  }
}
