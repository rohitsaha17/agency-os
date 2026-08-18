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

    const role = currentUser.role ?? "ADMIN";
    const myId = currentUser.id;

    // Members can't use the userId filter to peek at colleagues' calendars.
    if (role === "MEMBER" && filterUserId && filterUserId !== myId) {
      filterUserId = myId;
    }

    // ── Build task where clause with role scoping ──────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskWhere: any = {
      organizationId: orgId,
      deletedAt: null,
      dueDate: { gte: rangeStart, lte: rangeEnd },
    };

    // Role scoping for tasks
    if (role === "MEMBER" && myId && !filterUserId) {
      // Members see only their assigned tasks
      taskWhere.assignees = { some: { userId: myId } };
    } else if (role === "MANAGER" && myId && !filterUserId) {
      // Managers see tasks they manage, are assigned to, or in projects they created
      taskWhere.OR = [
        { managerId: myId },
        { assignees: { some: { userId: myId } } },
        { project: { createdById: myId } },
      ];
    }
    // ADMIN or explicit userId filter override role scoping

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

    // Role scoping for projects
    if (role === "MEMBER" && myId && !filterProjectId) {
      // Members only see projects where they have assigned tasks
      projectWhere.tasks = { some: { assignees: { some: { userId: myId } }, deletedAt: null } };
    } else if (role === "MANAGER" && myId && !filterProjectId) {
      projectWhere.AND = [
        ...(projectWhere.AND ?? []),
        {
          OR: [
            { createdById: myId },
            { tasks: { some: { OR: [{ managerId: myId }, { assignees: { some: { userId: myId } } }], deletedAt: null } } },
          ],
        },
      ];
    }

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
