import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify, notifyMany } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

const TASK_INCLUDE = {
  manager: { select: { id: true, name: true } },
  assignees: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  },
  _count: { select: { children: true } },
} as const;

// Max depth for recursive task-tree walks — prevents runaway recursion
// if a cycle is ever introduced in the hierarchy (shouldn't happen, but
// cheap insurance against a pathological data shape).
const MAX_RECURSION_DEPTH = 10;

// GET /api/tasks/[id] — fetch single task with all relations
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      include: TASK_INCLUDE,
    });
    if (!task) throw new ApiError("Task not found", 404);
    return NextResponse.json(serializeTask(task));
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]");
  }
}

// PATCH /api/tasks/[id] — update task fields and/or assignees
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    // Verify the task belongs to the caller's org before mutating.
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: {
        id: true, projectId: true, status: true, title: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!existing) throw new ApiError("Task not found", 404);

    const body = await req.json();
    const {
      title, description, status, priority, dueDate,
      parentId, order, managerId, assigneeIds, estimatedHours,
      isClientVisible, showSubtasksToClient,
      cascadeToChildren, // if true and status=DONE, mark all children DONE too
    } = body;

    // A new parent must be a different task in the same project (same org).
    if (parentId) {
      if (parentId === id) throw new ApiError("A task cannot be its own parent", 400);
      const parent = await prisma.task.findFirst({
        where: {
          id: parentId, deletedAt: null,
          projectId: existing.projectId,
          organizationId: user.organizationId,
        },
        select: { id: true },
      });
      if (!parent) throw new ApiError("Parent task not found", 404);
    }

    // Manager/assignees must be members of the caller's organization.
    if (managerId) {
      const manager = await prisma.user.findFirst({
        where: { id: managerId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!manager) throw new ApiError("Manager not found", 404);
    }
    if (assigneeIds !== undefined && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      const count = await prisma.user.count({
        where: { id: { in: assigneeIds }, organizationId: user.organizationId },
      });
      if (count !== new Set(assigneeIds).size) {
        throw new ApiError("One or more assignees not found", 404);
      }
    }

    if (estimatedHours !== undefined && estimatedHours !== null && estimatedHours !== "") {
      if (!Number.isFinite(parseFloat(estimatedHours))) {
        throw new ApiError("Estimated hours must be a number", 400);
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status      !== undefined && { status }),
        ...(priority    !== undefined && { priority }),
        ...(dueDate     !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(parentId    !== undefined && { parentId: parentId ?? null }),
        ...(order       !== undefined && { order }),
        ...(managerId   !== undefined && { managerId: managerId ?? null }),
        ...(estimatedHours !== undefined && { estimatedHours: estimatedHours !== null && estimatedHours !== "" ? parseFloat(estimatedHours) : null }),
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
      await cascadeStatusDown(id, "DONE", 0);
    }

    // If status changed, recompute parent's progress and potentially auto-complete parent
    if (status !== undefined && task.parentId) {
      await recomputeAncestorProgress(task.parentId, 0);
    }

    // ── v2: audit + notifications ──────────────────────────────
    if (status !== undefined && status !== existing.status) {
      await logStatus({
        organizationId: user.organizationId,
        entityType: "TASK",
        entityId: id,
        from: existing.status,
        to: status,
        userId: user.id,
      });
      // Task sent for review → tell the manager/reviewer.
      if (status === "IN_REVIEW" && task.managerId && task.managerId !== user.id) {
        await notify({
          organizationId: user.organizationId,
          userId: task.managerId,
          type: "TASK_IN_REVIEW",
          title: `"${task.title}" is ready for review`,
          body: `${user.name} moved the task to In Review.`,
          link: `/projects/${task.projectId}?task=${id}`,
        });
      }
    }
    // Newly added assignees → "task assigned" notification.
    if (assigneeIds !== undefined && Array.isArray(assigneeIds)) {
      const before = new Set(existing.assignees.map((a) => a.userId));
      const added = (assigneeIds as string[]).filter(
        (uid) => !before.has(uid) && uid !== user.id,
      );
      await notifyMany(added, {
        organizationId: user.organizationId,
        type: "TASK_ASSIGNED",
        title: `You were assigned: "${task.title}"`,
        body: `Assigned by ${user.name}.`,
        link: `/projects/${task.projectId}?task=${id}`,
      });
    }

    return NextResponse.json(serializeTask(task));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Task not found", 404);
    }
    return handleApiError(error, "PATCH /api/tasks/[id]");
  }
}

// DELETE /api/tasks/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id } = await params;

    // Verify org ownership before deleting.
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Task not found", 404);

    // Soft-delete this task and all its descendants
    await softDeleteDescendants(id, 0);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Task not found", 404);
    }
    return handleApiError(error, "DELETE /api/tasks/[id]");
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function softDeleteDescendants(taskId: string, depth: number): Promise<void> {
  if (depth >= MAX_RECURSION_DEPTH) return;
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true },
  });
  for (const child of children) {
    await softDeleteDescendants(child.id, depth + 1);
  }
  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date() },
  });
}

// Cascade a status update down to all children recursively (capped at MAX_RECURSION_DEPTH).
async function cascadeStatusDown(taskId: string, status: string, depth: number): Promise<void> {
  if (depth >= MAX_RECURSION_DEPTH) return;
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true },
  });
  for (const child of children) {
    await prisma.task.update({
      where: { id: child.id },
      data: { status: status as never, progress: status === "DONE" ? 100 : undefined },
    });
    await cascadeStatusDown(child.id, status, depth + 1);
  }
}

async function recomputeAncestorProgress(taskId: string, depth: number): Promise<void> {
  if (depth >= MAX_RECURSION_DEPTH) return;
  const children = await prisma.task.findMany({
    where: { parentId: taskId, deletedAt: null },
    select: { id: true, status: true, progress: true },
  });
  if (children.length === 0) return;

  const allDone = children.every((c) => c.status === "DONE");
  const avg = Math.round(
    children.reduce((sum, c) => sum + (c.status === "DONE" ? 100 : c.progress), 0) / children.length
  );

  const parent = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  });

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      progress: avg,
      // Auto-complete parent when ALL children are done; reopen it when a
      // child gets reopened after the parent was auto-completed.
      ...(allDone && { status: "DONE" }),
      ...(!allDone && parent?.status === "DONE" && { status: "IN_PROGRESS" }),
    },
    select: { parentId: true },
  });

  if (updated.parentId) {
    await recomputeAncestorProgress(updated.parentId, depth + 1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTask(task: any) {
  // Defensive null-safety: include may be narrowed (or an assignee's user
  // relation may be missing on a stale fixture), so guard every optional hop.
  const assignees = Array.isArray(task?.assignees) ? task.assignees : [];
  return {
    ...task,
    dueDate: task?.dueDate?.toISOString() ?? null,
    createdAt: task?.createdAt?.toISOString?.() ?? null,
    updatedAt: task?.updatedAt?.toISOString?.() ?? null,
    managerName: task?.manager?.name ?? null,
    primaryAssigneeName: assignees?.[0]?.user?.name ?? null,
    assignees: assignees.map((a: { userId: string; user: unknown }) => ({
      userId: a?.userId ?? null,
      user: a?.user ?? null,
    })),
  };
}
