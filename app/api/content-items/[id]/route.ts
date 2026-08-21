import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";
import { isSettled, settledReason } from "@/lib/content-status";
import { createContentWorkTask, syncPlanningTask } from "@/lib/auto-tasks";

type Params = { params: Promise<{ id: string }> };

const ITEM_INCLUDE = {
  creativeType: true,
  client: { select: { id: true, name: true } },
  carriedFrom: { select: { id: true, date: true } },
  createdBy: { select: { id: true, name: true } },
  tasks: {
    where: { deletedAt: null },
    select: {
      id: true, title: true, status: true, projectId: true, assignmentStatus: true,
      assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  },
} as const;

async function findItem(id: string, organizationId: string) {
  const item = await prisma.contentItem.findFirst({
    where: { id, organizationId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw new ApiError("Content item not found", 404);
  return item;
}

// GET /api/content-items/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const item = await findItem(id, user.organizationId);
    return NextResponse.json(item);
  } catch (error) {
    return handleApiError(error, "GET /api/content-items/[id]");
  }
}

// PATCH /api/content-items/[id] — edit fields (not status; see /status)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const existing = await findItem(id, user.organizationId);
    const body = await req.json();
    const {
      date, creativeTypeId, topic, description, referenceUrl, referenceFileId,
      isExtra, isAdHoc, projectId, countAgainstPrevMonth,
      // v3: billing intent, the cycle, and assigning from the plan
      billingIntent, cycleId, assigneeId, taskDueAt, taskPriority,
    } = body;

    // v3: an SMM flags work but never un-flags an extra — turning a billable
    // extra back into included work is a pricing decision, so it needs
    // projects.pricing (docs/V3_CONTEXT.md §2).
    const canOverrideBilling = can(user, "projects.pricing");

    /**
     * An approved or posted item is a record, not a form. Rewriting the brief
     * after approval would leave the recorded decision describing something
     * that no longer exists.
     *
     * The status field itself is exempt: that is how a piece legitimately
     * moves on — approved to scheduled, scheduled to posted.
     */
    if (isSettled(existing.status)) {
      const editing = Object.keys(body).filter(
        (k) => !["status", "billingIntent"].includes(k),
      );
      if (editing.length > 0) {
        throw new ApiError(settledReason(existing.status), 409);
      }
    }

    if (creativeTypeId) {
      const type = await prisma.creativeType.findFirst({
        where: { id: creativeTypeId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!type) throw new ApiError("Creative type not found", 404);
    }

    const updated = await prisma.contentItem.update({
      where: { id },
      data: {
        ...(date !== undefined && { date: new Date(date) }),
        ...(creativeTypeId !== undefined && { creativeTypeId }),
        ...(topic !== undefined && { topic: topic.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(referenceUrl !== undefined && { referenceUrl: referenceUrl?.trim() || null }),
        ...(referenceFileId !== undefined && { referenceFileId: referenceFileId || null }),
        ...(isExtra !== undefined && canOverrideBilling && { isExtra: !!isExtra }),
        ...(billingIntent !== undefined && canOverrideBilling && { billingIntent }),
        ...(cycleId !== undefined && { cycleId: cycleId || null }),
        ...(isAdHoc !== undefined && { isAdHoc: !!isAdHoc }),
        ...(projectId !== undefined && { projectId: projectId || null }),
        ...(countAgainstPrevMonth !== undefined && { countAgainstPrevMonth: !!countAgainstPrevMonth }),
      },
      include: ITEM_INCLUDE,
    });

    // v3: assigning later works exactly like assigning while planning —
    // createContentWorkTask is idempotent per (item, assignee).
    if (assigneeId) {
      await createContentWorkTask({
        organizationId: user.organizationId,
        contentItemId: id,
        assigneeId,
        approverId: user.id,
        dueDate: taskDueAt ? new Date(taskDueAt) : undefined,
        priority: taskPriority ?? undefined,
      });
      const fresh = await prisma.contentItem.findUnique({
        where: { id },
        include: ITEM_INCLUDE,
      });
      return NextResponse.json(fresh ?? updated);
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/content-items/[id]");
  }
}

// DELETE /api/content-items/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;
    const doomed = await findItem(id, user.organizationId);
    await prisma.contentItem.delete({ where: { id } });
    // Removing an item can take the plan back under quota, which should
    // reopen the planning task rather than leave it falsely closed.
    if (doomed?.projectId) await syncPlanningTask(doomed.projectId, user.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/content-items/[id]");
  }
}
