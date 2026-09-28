import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// GET /api/calendar?year=2026&month=3&userId=x&projectId=x&clientId=x&priority=HIGH
export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req);
    const orgId = currentUser.organizationId;

    const { searchParams } = new URL(req.url);
    let year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
    let month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
    if (!Number.isFinite(year))  year  = new Date().getFullYear();
    if (!Number.isFinite(month) || month < 1 || month > 12) month = new Date().getMonth() + 1;
    let filterUserId    = searchParams.get("userId")    ?? undefined;
    const filterProjectId = searchParams.get("projectId") ?? undefined;
    const filterClientId  = searchParams.get("clientId")  ?? undefined;
    const filterPriority  = searchParams.get("priority")  ?? undefined;

    const rangeStart = new Date(year, month - 1, 1);
    const rangeEnd   = new Date(year, month, 0, 23, 59, 59);

    /*
      The last of the MEMBER checks went with the others.

      It stopped a MEMBER filtering the calendar by a colleague — a rule that
      has protected nobody since the role was retired, and that now contradicts
      a calendar everyone can read anyway. Filtering by a person is narrowing
      a view, not widening one.
    */

    // ── Build task where clause ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskWhere: any = {
      organizationId: orgId,
      deletedAt: null,
      dueDate: { gte: rangeStart, lte: rangeEnd },
    };

    /*
      No role scoping. The team calendar shows the team's schedule.

      What was here scoped on role === "MEMBER", a role this product retired:
      nobody is a MEMBER any more, so TEAM and SMM matched neither branch and
      already received everything. MANAGER matched the second branch and was
      narrowed to their own work — so a manager saw LESS of the team calendar
      than the junior sitting next to them, which is the opposite of the point
      of it.

      Everybody sees it now, deliberately rather than by accident. Nothing
      confidential travels: the payload is titles, dates, statuses and names.
      No amount, budget or rate is selected here, so there is nothing for
      financials.view to protect.

      The explicit filters below still work, for anybody narrowing the view.
    */

    // Explicit filters
    if (filterUserId) {
      taskWhere.assignees = { some: { userId: filterUserId } };
    }
    if (filterProjectId) taskWhere.projectId = filterProjectId;
    if (filterClientId) taskWhere.project = { ...taskWhere.project, clientId: filterClientId };
    if (filterPriority) taskWhere.priority = filterPriority;

    // ── Build project where clause ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectWhere: any = {
      organizationId: orgId,
      status: { not: "CANCELLED" },
      OR: [
        { startDate: { gte: rangeStart, lte: rangeEnd } },
        { endDate:   { gte: rangeStart, lte: rangeEnd } },
        { startDate: { lte: rangeStart }, endDate: { gte: rangeEnd } },
      ],
    };

    if (filterProjectId) projectWhere.id = filterProjectId;
    if (filterClientId) projectWhere.clientId = filterClientId;

    // Projects are scoped the same way, which is to say not at all — see above.

    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          assignees: { select: { user: { select: { id: true, name: true } } } },
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          client: { select: { id: true, name: true } },
        },
      }),
    ]);

    const events = [
      ...tasks.map((t) => ({
        id: t.id,
        title: t.title,
        date: t.dueDate!.toISOString(),
        type: "task" as const,
        status: t.status,
        priority: t.priority,
        projectId: t.project?.id ?? null,
        projectName: t.project?.name ?? "General",
        clientName: t.project?.client.name ?? "",
        clientId: t.project?.client.id ?? null,
        assignees: t.assignees.map((a) => a.user.name),
        color: priorityColor(t.priority),
      })),
      ...projects.map((p) => ({
        id: p.id,
        title: p.name,
        date: p.startDate?.toISOString() ?? "",
        endDate: p.endDate?.toISOString() ?? undefined,
        type: "project" as const,
        status: p.status,
        clientName: p.client.name,
        clientId: p.client.id,
        color: projectStatusColor(p.status),
      })),
    ];

    return NextResponse.json(events);
  } catch (e) {
    return handleApiError(e, "GET /api/calendar");
  }
}

function priorityColor(priority: string) {
  const map: Record<string, string> = {
    LOW: "#94a3b8", MEDIUM: "#6366f1", HIGH: "#f97316", URGENT: "#ef4444",
  };
  return map[priority] ?? "#6366f1";
}

function projectStatusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT: "#94a3b8", ACTIVE: "#10b981", ON_HOLD: "#f59e0b",
    COMPLETED: "#3b82f6", CANCELLED: "#ef4444",
  };
  return map[status] ?? "#6366f1";
}
