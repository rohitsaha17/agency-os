import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const TASK_INCLUDE = {
  manager: { select: { id: true, name: true } },
  assignees: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  },
  _count: { select: { children: true } },
} as const;

// GET /api/tasks/[id] — fetch single task with all relations
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const task = await prisma.task.findUnique({
      where: { id, deletedAt: null },
      include: TASK_INCLUDE,
    });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(serializeTask(task));
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/tasks/[id] — update task fields and/or assignees
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    const {
      title, description, status, priority, dueDate,
      parentId, order, managerId, assigneeIds, estimatedHours,
      isClientVisible, showSubtasksToClient,
      cascadeToChildren, // if true and status=DONE, mark all children DONE too
    } = body;

    const task = await prisma.task.update({
      where: { id, deletedAt: null },
      data: {
        ...(title       !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status      !== undefined && { status }),
        ...(priority    !== undefined && { priority }),
        ...(dueDate     !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(parentId    !== undefined && { parentId: parentId ?? null }),
        ...(order       !== undefined && { order }),
        ...(managerId   !== undefined && { managerId: managerId ?? null }),
        ...(estimatedHours !== undefined && { estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null }),
        ...(isClientVisible !== undefined && { isClientVisible }),
        ...(showSubtasksToClient !== undefined && { showSubtasksToClient }),
        // Sync assignees if provided
        ...(assigneeIds !== undefined && {
          assignees: {
            deleteMany: {},
            create: (assigneeIds as string[]).map((userId) => ({ userId })),
          },
        }),
      },
      include: TASK_INCLUDE,
    });

    // Cascade DONE status to all children if requested
    if (status === "DONE" && cascadeToChildren) {
      await cascadeStatusDown(id, "DONE");
    }

    // If status changed, recompute parent's progress and potentially auto-complete parent
    if (status !== undefined && task.parentId) {
      await recomputeAncestorProgress(task.parentId);
    }

    return NextResponse.json(serializeTask(task));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error("[PATCH /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    // Soft-delete this task and all its descendants
    await softDeleteDescendants(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error("[DELETE /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function softDeleteDescendants(taskId: string): Promise<void> {
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true },
  });
  for (const child of children) {
    await softDeleteDescendants(child.id);
  }
  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date() },
  });
}

// Cascade a status update down to all children recursively
async function cascadeStatusDown(taskId: string, status: string): Promise<void> {
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true },
  });
  for (const child of children) {
    await prisma.task.update({
      where: { id: child.id },
      data: { status: status as never, progress: status === "DONE" ? 100 : undefined },
    });
    await cascadeStatusDown(child.id, status);
  }
}

async function recomputeAncestorProgress(taskId: string): Promise<void> {
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true, status: true, progress: true },
  });
  if (children.length === 0) return;

  const allDone = children.every((c) => c.status === "DONE");
  const avg = Math.round(
    children.reduce((sum, c) => sum + (c.status === "DONE" ? 100 : c.progress), 0) / children.length
  );

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      progress: avg,
      // Auto-complete parent when ALL children are done
      ...(allDone && { status: "DONE" }),
    },
    select: { parentId: true },
  });

  if (updated.parentId) {
    await recomputeAncestorProgress(updated.parentId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTask(task: any) {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignees: task.assignees.map((a: { userId: string; user: unknown }) => ({
      userId: a.userId,
      user: a.user,
    })),
  };
}
