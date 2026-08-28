import { NextRequest, NextResponse } from "next/server";
import { assertAssignable } from "@/lib/assignment-guard";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability, taskVisibilityScope } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify, notifyMany } from "@/lib/notify";
import { can } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

/**
 * What an assignee may change on a task they were handed: how far along it is,
 * and nothing else. The brief — what the work is, when it's due, how urgent,
 * who it's for, whether the client sees it — was set by whoever planned it and
 * stays theirs. Hiding these inputs in the panel is a courtesy; this is the
 * actual rule.
 */
const PROGRESS_FIELDS = new Set(["status", "cascadeToChildren"]);

/**
 * The only status an assignee may set directly.
 *
 * Everything else in the loop is the result of an action with a payload, and
 * has its own route: IN_REVIEW comes from /submit (which requires proof), DONE
 * from /approve, CHANGES_REQUESTED from /change-requests. Letting a plain
 * PATCH write those would be a way to hand work in with no evidence, or to
 * approve your own, so it doesn't.
 */
const ASSIGNEE_SETTABLE_STATUS = new Set(["IN_PROGRESS"]);

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

    // Same scope as the list — a task you can't see in the list shouldn't
    // open just because you have its id.
    const task = await prisma.task.findFirst({
      where: {
        id, deletedAt: null, organizationId: user.organizationId,
        AND: [taskVisibilityScope(user)],
      },
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
        id: true, projectId: true, status: true, title: true, kind: true,
        // assignedById: so a reassignment can go back to whoever handed it over.
        assignees: { select: { userId: true, assignedById: true } },
        // Needed to check a moved due date against the existing assignees.
        dueDate: true,
      },
    });
    if (!existing) throw new ApiError("Task not found", 404);

    const body = await req.json();
    const {
      title, description, status, priority, dueDate,
      parentId, order, managerId, assigneeIds, estimatedHours,
      isClientVisible, showSubtasksToClient,
      cascadeToChildren, // if true and status=DONE, mark all children DONE too
      // v2 fields
      topic, content, referenceUrl, referenceFileId, extraNote,
      clientId, preferredAssigneeId, isAdHoc, sortOrder, reassignNote,
    } = body;

    /**
     * A PLANNING or POST task is created by the system for a specific person.
     * They carry it out; they don't get to rewrite its terms, reassign it or
     * move its deadline — even holding content.plan, as an SMM does. Only
     * whoever runs the agency changes what was asked for.
     */
    const isSystemTask = existing.kind === "PLANNING" || existing.kind === "POST";
    const isMine = existing.assignees.some((a) => a.userId === user.id);
    const mayRewrite = can(user, "content.plan")
      && !(isSystemTask && isMine && !can(user, "clients.manage"));

    if (!mayRewrite) {
      const planned = Object.keys(body).filter((k) => !PROGRESS_FIELDS.has(k));
      if (planned.length > 0) {
        throw new ApiError(
          isSystemTask
            ? "This task was created for you when the project was set up. You can move "
              + `it along, but an admin or manager owns its terms. Ask them to change: ${planned.join(", ")}.`
            : "You can move this task along, but its brief is set by whoever planned it. "
              + `Ask them to change: ${planned.join(", ")}.`,
          403,
        );
      }
      if (existing.status === "DONE") {
        throw new ApiError(
          "This task has been approved and closed. Ask an admin or the reviewer to reopen it.",
          403,
        );
      }
      if (status !== undefined && !ASSIGNEE_SETTABLE_STATUS.has(status)) {
        throw new ApiError(
          status === "IN_REVIEW"
            ? "Use Mark completed so the work goes in with its details attached."
            : `Only the reviewer can move this task to ${String(status).toLowerCase().replace(/_/g, " ")}.`,
          403,
        );
      }
    }

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

    // Check against whichever of the two is changing. Moving a task ONTO a
    // day its assignee has blocked is the same mistake as assigning it there
    // in the first place, and only checking the assignee list would let it
    // through.
    {
      const nextAssignees = assigneeIds !== undefined && Array.isArray(assigneeIds)
        ? (assigneeIds as string[])
        : existing.assignees.map((a) => a.userId);
      const nextDue = dueDate !== undefined ? dueDate : existing.dueDate;
      await assertAssignable(user.organizationId, nextAssignees, nextDue);
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
        // v2 fields
        ...(topic !== undefined && { topic: topic?.trim() || null }),
        ...(content !== undefined && { content: content?.trim() || null }),
        ...(referenceUrl !== undefined && { referenceUrl: referenceUrl?.trim() || null }),
        ...(referenceFileId !== undefined && { referenceFileId: referenceFileId || null }),
        ...(extraNote !== undefined && { extraNote: extraNote?.trim() || null }),
        ...(clientId !== undefined && { clientId: clientId || null }),
        ...(preferredAssigneeId !== undefined && { preferredAssigneeId: preferredAssigneeId || null }),
        ...(isAdHoc !== undefined && { isAdHoc: !!isAdHoc }),
        ...(sortOrder !== undefined && { sortOrder }),
        // Sync assignees if provided.
        //
        // Only what actually changed. This used to delete every row and
        // recreate the lot, which meant somebody who was on the task before
        // and is still on it afterwards had their acceptance thrown away and
        // was asked to accept work they were already doing — every time
        // anybody edited the assignee list.
        ...(assigneeIds !== undefined && {
          assignees: {
            deleteMany: {
              userId: { notIn: (assigneeIds as string[]) },
            },
            create: (assigneeIds as string[])
              .filter((uid) => !existing.assignees.some((a) => a.userId === uid))
              // A fresh assignment starts PENDING (the schema default) and
              // remembers who handed it over, so a decline can go back to
              // the right person.
              .map((userId) => ({ userId, assignedById: user.id })),
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
    // Newly added assignees → "task assigned" notification (+ audit on reassign).
    if (assigneeIds !== undefined && Array.isArray(assigneeIds)) {
      const before = new Set(existing.assignees.map((a) => a.userId));
      const added = (assigneeIds as string[]).filter(
        (uid) => !before.has(uid) && uid !== user.id,
      );
      const removed = existing.assignees.filter((a) => !(assigneeIds as string[]).includes(a.userId));
      const taskLink = task.projectId ? `/projects/${task.projectId}?task=${id}` : `/tasks?task=${id}`;
      await notifyMany(added, {
        organizationId: user.organizationId,
        type: "TASK_ASSIGNED",
        title: `You were assigned: "${task.title}"`,
        body: reassignNote ? `${user.name}: ${String(reassignNote).slice(0, 140)}` : `Assigned by ${user.name}.`,
        link: taskLink,
      });
      /*
        Tell the senior their work moved.

        An SMM handing a task to an editor is normal and shouldn't need
        permission — but the person who assigned it is still answerable for it
        landing, and finding out only when the wrong name appears on the
        finished thing is too late. So the task's reviewer hears about a
        reassignment they didn't make.

        Not the person doing it, and not on the first assignment either: being
        told "the task you just created has been assigned" is noise.
      */
      if (added.length > 0 && before.size > 0) {
        const seniors = [task.managerId, existing.assignees[0]?.assignedById]
          .filter((uid): uid is string => !!uid && uid !== user.id);
        await notifyMany(seniors, {
          organizationId: user.organizationId,
          type: "TASK_REASSIGNED",
          title: `${user.name} reassigned "${task.title}"`,
          body: reassignNote
            ? String(reassignNote).slice(0, 140)
            : "Passed to someone else.",
          link: taskLink,
        });
      }

      if (added.length || removed.length) {
        await logStatus({
          organizationId: user.organizationId,
          entityType: "TASK",
          entityId: id,
          from: null,
          to: "REASSIGNED_MEMBERS",
          userId: user.id,
          note: reassignNote
            ? `assignees changed — ${String(reassignNote).slice(0, 120)}`
            : "assignees changed",
        });
      }
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
    // Deleting is a planning act, so it matches who may plan — an SMM can
    // remove work they scheduled; the person doing that work cannot.
    requireCapability(user, "content.plan");
    const { id } = await params;

    // ...but not the task the system handed them. Deleting your own planning
    // or posting task is deleting the record that you were asked to do it.
    const doomed = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { kind: true, assignees: { select: { userId: true } } },
    });
    if (
      doomed
      && (doomed.kind === "PLANNING" || doomed.kind === "POST")
      && doomed.assignees.some((a) => a.userId === user.id)
      && !can(user, "clients.manage")
    ) {
      throw new ApiError(
        "This task was created for you and isn't yours to delete. "
        + "Ask an admin or manager if it shouldn't be there.",
        403,
      );
    }

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
