import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

// GET /api/tasks/[id]/change-requests — list (newest first)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const requests = await prisma.changeRequest.findMany({
      where: { taskId: id },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(requests);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/change-requests");
  }
}

// POST /api/tasks/[id]/change-requests — "assign changes": note on what to
// change; flips the task back to IN_PROGRESS, notifies assignees, logs.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { note } = await req.json();
    if (!note?.trim()) throw new ApiError("A note describing the changes is required", 400);

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true, title: true, status: true, projectId: true, assignees: { select: { userId: true } } },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const [request] = await prisma.$transaction([
      prisma.changeRequest.create({
        data: { taskId: id, requestedById: user.id, note: note.trim() },
        include: { requestedBy: { select: { id: true, name: true } } },
      }),
      prisma.task.update({ where: { id }, data: { status: "IN_PROGRESS" } }),
    ]);

    if (task.status !== "IN_PROGRESS") {
      await logStatus({
        organizationId: user.organizationId,
        entityType: "TASK",
        entityId: id,
        from: task.status,
        to: "IN_PROGRESS",
        userId: user.id,
        note: `changes requested: ${note.trim().slice(0, 120)}`,
      });
    }
    await notifyMany(
      task.assignees.map((a) => a.userId).filter((uid) => uid !== user.id),
      {
        organizationId: user.organizationId,
        type: "TASK_CHANGES_REQUESTED",
        title: `Changes requested on "${task.title}"`,
        body: note.trim().slice(0, 160),
        link: task.projectId ? `/projects/${task.projectId}?task=${id}` : `/tasks?task=${id}`,
      },
    );

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/change-requests");
  }
}

// PATCH /api/tasks/[id]/change-requests — resolve one ({ requestId })
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { requestId } = await req.json();

    const request = await prisma.changeRequest.findFirst({
      where: { id: requestId, taskId: id, task: { organizationId: user.organizationId } },
      select: { id: true, status: true },
    });
    if (!request) throw new ApiError("Change request not found", 404);

    const updated = await prisma.changeRequest.update({
      where: { id: requestId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
      include: { requestedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/tasks/[id]/change-requests");
  }
}
