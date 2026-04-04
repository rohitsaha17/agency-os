import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/tasks/[id]/time-entries
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const entries = await prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/tasks/[id]/time-entries — log time
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const { hours, date, notes } = await req.json();
    if (!hours || isNaN(parseFloat(hours)) || parseFloat(hours) <= 0) {
      return NextResponse.json({ error: "Valid hours required" }, { status: 400 });
    }

    const entry = await prisma.timeEntry.create({
      data: {
        taskId,
        hours: parseFloat(hours),
        date: date ? new Date(date) : new Date(),
        notes: notes?.trim() || null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    // Update task's loggedHours aggregate
    const agg = await prisma.timeEntry.aggregate({
      where: { taskId },
      _sum: { hours: true },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { loggedHours: agg._sum.hours ?? 0 },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to log time" }, { status: 500 });
  }
}
