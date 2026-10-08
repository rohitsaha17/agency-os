import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { ensureFestivalPack, scanUpcomingEvents } from "@/lib/reminders";
import { can } from "@/lib/permissions";

/**
 * GET /api/master-calendar?year&month&clientId&projectId&creativeTypeId&
 *   status&assigneeId&extraOnly&adHocOnly
 *
 * The org-wide content view. Access filtering IS here (docs/V2_CONTEXT.md §4):
 * ADMIN/MANAGER/OWNER see everything; MEMBERs see only content items with a
 * linked task assigned to them (plus org-wide events). No financial fields.
 *
 * `away` is who cannot be booked on each day, and it ships only to people
 * with content.plan — which is exactly the planners, the ones deciding who
 * shoots what. A junior looking at the calendar has no business reading the
 * whole team's diary.
 *
 * It reads `unavailability` rather than `leave_requests`, which means it
 * covers both halves of "can't work that day" in one query: approved leave
 * (written there on approval) and a photographer who has blocked the day for
 * a shoot of their own. The planner's question is the same either way.
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

    /*
      The MEMBER scoping that used to be here is gone with the role itself.

      It narrowed the content calendar to items a MEMBER had a task on, and
      restricted them to org-wide events. Nobody has been a MEMBER for a while,
      so TEAM and SMM already received the whole thing — the rule had stopped
      applying to anyone long before it was removed. The team calendar is the
      team's, and it carries topics, dates and names rather than anything
      confidential.
    */
    const plans = can(user, "content.plan");

    const [items, events, away] = await Promise.all([
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
        },
        select: {
          id: true, clientId: true, projectId: true, date: true, topic: true,
          description: true, // drives the Reserved/Planned distinction on the chip
          status: true, isExtra: true, isAdHoc: true, carriedFromId: true,
          client: { select: { id: true, name: true } },
          // v3: chips name the project too, so a client with several
          // retainers reads clearly on the org-wide view
          project: { select: { id: true, name: true } },
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
            AND: [
              // In range (single-day or spanning)
              { OR: [{ date: { gte: from, lt: to } }, { endDate: { gte: from, lt: to } }] },
              // A client filter narrows to that client's events plus the
              // org-wide ones, so festivals stay on the page as context.
              ...(clientId ? [{ OR: [{ clientId }, { clientId: null }] }] : []),
            ],
          },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { date: "asc" },
        });
      })(),
      plans
        ? prisma.unavailability.findMany({
            where: {
              organizationId: user.organizationId,
              date: { gte: from, lt: to },
              // When the calendar is filtered to one person, their leave is the
              // only leave that belongs on it. Without this the away layer kept
              // showing the WHOLE team's days off while everything else narrowed
              // to the chosen person — so the page read as if that person were
              // away on days their colleagues were, which they were not.
              ...(assigneeId ? { userId: assigneeId } : {}),
            },
            select: {
              userId: true, date: true, kind: true, reason: true,
              user: { select: { id: true, name: true } },
            },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
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
      away: away.map((a) => ({
        userId: a.userId,
        name: a.user?.name ?? "Someone",
        date: a.date.toISOString().slice(0, 10),
        kind: a.kind,
        reason: a.reason,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/master-calendar");
  }
}
