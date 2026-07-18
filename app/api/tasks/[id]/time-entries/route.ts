import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertTaskInOrg(taskId: string, organizationId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId },
    select: { id: true },
  });
  if (!task) throw new ApiError("Task not found", 404);
}

// GET /api/tasks/[id]/time-entries
export async function GET(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

    const entries = await prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(entries);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/time-entries");
  }
}

// POST /api/tasks/[id]/time-entries — log time
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

    const { hours, date, notes } = await req.json();
    if (!hours || isNaN(parseFloat(hours)) || parseFloat(hours) <= 0) {
      throw new ApiError("Valid hours required", 400);
    }
    const parsedDate = date ? new Date(date) : new Date();
    if (isNaN(parsedDate.getTime())) throw new ApiError("Invalid date", 400);

    const entry = await prisma.timeEntry.create({
      data: {
        taskId,
        userId: user.id,
        hours: parseFloat(hours),
        date: parsedDate,
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
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/time-entries");
  }
}
