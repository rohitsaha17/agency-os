import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// GET /api/reports/missed?month=YYYY-MM&clientId=&assigneeId=
// "Missed & crossed deadlines" — overdue/late tasks + MISSED content items.
// Admins + managers only.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month"); // optional YYYY-MM
    const clientId = sp.get("clientId") ?? undefined;
    const assigneeId = sp.get("assigneeId") ?? undefined;

    let range: { gte: Date; lt: Date } | undefined;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }
    const now = new Date();

    const [tasks, items] = await Promise.all([
      prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { not: "DONE" },
          dueDate: range ?? { lt: now },
          ...(range && { dueDate: { ...range, lt: new Date(Math.min(range.lt.getTime(), now.getTime())) } }),
          ...(assigneeId && { assignees: { some: { userId: assigneeId } } }),
          ...(clientId && { OR: [{ clientId }, { project: { clientId } }] }),
        },
        select: {
          id: true, title: true, dueDate: true, status: true, projectId: true,
          client: { select: { name: true } },
          project: { select: { name: true, client: { select: { name: true } } } },
          assignees: { select: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.contentItem.findMany({
        where: {
          organizationId: user.organizationId,
          status: "MISSED",
          ...(range && { date: range }),
          ...(clientId && { clientId }),
          ...(assigneeId && { tasks: { some: { deletedAt: null, assignees: { some: { userId: assigneeId } } } } }),
        },
        select: {
          id: true, topic: true, date: true, status: true, clientId: true,
          client: { select: { name: true } },
          creativeType: { select: { name: true } },
          tasks: { where: { deletedAt: null }, select: { assignees: { select: { user: { select: { name: true } } } } } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const daysLate = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));

    const rows = [
      ...tasks.filter((t) => t.dueDate && t.dueDate < now).map((t) => ({
        kind: "task" as const,
        id: t.id,
        title: t.title,
        client: t.client?.name ?? t.project?.client?.name ?? "—",
        assignee: t.assignees.map((a) => a.user.name).join(", ") || "Unassigned",
        dueDate: t.dueDate!.toISOString(),
        daysLate: daysLate(t.dueDate!),
        status: t.status,
        link: t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`,
      })),
      ...items.map((i) => ({
        kind: "content" as const,
        id: i.id,
        title: `${i.creativeType.name}: ${i.topic}`,
        client: i.client.name,
        assignee: i.tasks.flatMap((t) => t.assignees.map((a) => a.user.name)).join(", ") || "Unassigned",
        dueDate: i.date.toISOString(),
        daysLate: daysLate(i.date),
        status: i.status,
        link: `/clients/${i.clientId}?tab=content`,
      })),
    ].sort((a, b) => b.daysLate - a.daysLate);

    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error, "GET /api/reports/missed");
  }
}
