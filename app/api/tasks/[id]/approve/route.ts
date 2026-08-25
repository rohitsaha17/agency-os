import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isHeadOfDesign } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

// POST /api/tasks/[id]/approve — Head-of-Design decision on a pending task.
// Body: { assigneeId? } — omitted → approve the preferred assignee;
// different user → reassign to them instead.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    if (!isHeadOfDesign(user)) {
      throw new ApiError("Only the Head of Design or an admin can approve assignments", 403);
    }
    const { id } = await params;
    const { assigneeId } = await req.json().catch(() => ({}));

    const task = await prisma.task.findFirst({
      where: {
        id, deletedAt: null,
        organizationId: user.organizationId,
        assignmentStatus: "PENDING_HEAD_APPROVAL",
      },
      select: { id: true, title: true, projectId: true, preferredAssigneeId: true },
    });
    if (!task) throw new ApiError("Pending task not found", 404);

    const finalAssigneeId: string | null = assigneeId || task.preferredAssigneeId;
    if (!finalAssigneeId) throw new ApiError("No assignee to approve", 400);

    const member = await prisma.user.findFirst({
      where: { id: finalAssigneeId, organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true },
    });
    if (!member) throw new ApiError("Assignee not found", 404);

    const reassigned = !!assigneeId && assigneeId !== task.preferredAssigneeId;
    const updated = await prisma.task.update({
      where: { id },
      data: {
        assignmentStatus: reassigned ? "REASSIGNED" : "APPROVED",
        assignees: { deleteMany: {}, create: [{ userId: finalAssigneeId, assignedById: user.id }] },
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "TASK",
      entityId: id,
      from: "PENDING_HEAD_APPROVAL",
      to: reassigned ? "REASSIGNED" : "APPROVED",
      userId: user.id,
      note: reassigned
        ? `head reassigned to ${member.name}`
        : `head approved preferred assignee ${member.name}`,
    });
    if (finalAssigneeId !== user.id) {
      await notify({
        organizationId: user.organizationId,
        userId: finalAssigneeId,
        type: "TASK_ASSIGNED",
        title: `You were assigned: "${task.title}"`,
        body: `Approved by ${user.name}.`,
        link: task.projectId ? `/projects/${task.projectId}?task=${id}` : `/tasks?task=${id}`,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/approve");
  }
}
