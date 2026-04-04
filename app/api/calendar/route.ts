import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/calendar?year=2026&month=3 (month is 1-indexed)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  // Range: first day of month → last day of month (with buffer)
  const rangeStart = new Date(year, month - 1, 1);
  const rangeEnd   = new Date(year, month, 0, 23, 59, 59);

  try {
    const [tasks, projects] = await Promise.all([
      // Tasks with dueDate in range
      prisma.task.findMany({
        where: {
          deletedAt: null,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          project: { select: { id: true, name: true, client: { select: { name: true } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
      // Projects whose timeline overlaps the month
      prisma.project.findMany({
        where: {
          status: { not: "CANCELLED" },
          OR: [
            { startDate: { gte: rangeStart, lte: rangeEnd } },
            { endDate:   { gte: rangeStart, lte: rangeEnd } },
            { startDate: { lte: rangeStart }, endDate: { gte: rangeEnd } },
          ],
        },
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          client: { select: { name: true } },
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
        projectId: t.project.id,
        projectName: t.project.name,
        clientName: t.project.client.name,
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
        color: projectStatusColor(p.status),
      })),
    ];

    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
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
