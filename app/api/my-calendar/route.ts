import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * GET /api/my-calendar?from=ISO&to=ISO — the CURRENT user's personal
 * calendar entries, each tagged with `kind` so the UI styles them
 * distinctly. Payload shape is a single `entries` array so later phases
 * (events, follow-ups, bookings) can add kinds without breaking clients.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    if (!from || !to) throw new ApiError("from and to are required", 400);
    const range = { gte: new Date(from), lt: new Date(to) };

    const [tasks, contentItems, personal] = await Promise.all([
      // (a) tasks assigned to me, by due date
      prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          dueDate: range,
          assignees: { some: { userId: user.id } },
        },
        select: {
          id: true, title: true, topic: true, status: true, priority: true,
          dueDate: true, projectId: true, contentItemId: true,
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
      }),
      // (b) content items with a linked task assigned to me, by publish date
      prisma.contentItem.findMany({
        where: {
          organizationId: user.organizationId,
          date: range,
          tasks: { some: { deletedAt: null, assignees: { some: { userId: user.id } } } },
        },
        select: {
          id: true, topic: true, status: true, date: true, clientId: true,
          client: { select: { id: true, name: true } },
          creativeType: { select: { id: true, name: true, icon: true, color: true } },
        },
      }),
      // (c) my personal items
      prisma.personalItem.findMany({
        where: { userId: user.id, date: range },
        include: { createdBy: { select: { id: true, name: true } } },
      }),
    ]);

    const entries = [
      ...tasks.map((t) => ({
        kind: "task" as const,
        id: t.id,
        date: t.dueDate!.toISOString(),
        title: t.title,
        topic: t.topic,
        status: t.status,
        priority: t.priority,
        projectId: t.projectId,
        contentItemId: t.contentItemId,
        clientName: t.client?.name ?? t.project?.client?.name ?? null,
        link: t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`,
      })),
      ...contentItems.map((c) => ({
        kind: "content" as const,
        id: c.id,
        date: c.date.toISOString(),
        title: c.topic,
        status: c.status,
        clientName: c.client.name,
        clientId: c.clientId,
        creativeType: c.creativeType,
        link: `/clients/${c.clientId}?tab=content`,
      })),
      ...personal.map((p) => ({
        kind: "personal" as const,
        id: p.id,
        date: p.date.toISOString(),
        time: p.time,
        title: p.title,
        note: p.note,
        done: p.done,
        addedBy: p.createdById && p.createdById !== user.id ? p.createdBy?.name ?? null : null,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // Overdue strip: my incomplete past-due tasks + personal items (any date)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [overdueTasks, overduePersonal] = await Promise.all([
      prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { not: "DONE" },
          dueDate: { lt: today },
          assignees: { some: { userId: user.id } },
        },
        select: { id: true, title: true, dueDate: true, projectId: true, priority: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      prisma.personalItem.findMany({
        where: { userId: user.id, done: false, date: { lt: today } },
        orderBy: { date: "asc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      entries,
      overdue: [
        ...overdueTasks.map((t) => ({
          kind: "task" as const,
          id: t.id,
          title: t.title,
          date: t.dueDate!.toISOString(),
          priority: t.priority,
          link: t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`,
        })),
        ...overduePersonal.map((p) => ({
          kind: "personal" as const,
          id: p.id,
          title: p.title,
          date: p.date.toISOString(),
        })),
      ],
    });
  } catch (error) {
    return handleApiError(error, "GET /api/my-calendar");
  }
}
