import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

const METHODS = ["FILE_UPLOAD", "LINK", "WHATSAPP", "SLACK", "OTHER"] as const;

// GET /api/tasks/[id]/delivery — delivery records for a task (newest first)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const deliveries = await prisma.taskDelivery.findMany({
      where: { taskId: id },
      include: {
        deliveredBy: { select: { id: true, name: true } },
        file: { select: { id: true, name: true, url: true } },
      },
      orderBy: { deliveredAt: "desc" },
    });
    return NextResponse.json(deliveries);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/delivery");
  }
}

// POST /api/tasks/[id]/delivery — record delivery proof and mark the task
// DONE. Body: { method, fileId?, url?, note?, skipProof? }.
// skipProof=true completes the task without a delivery record.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { method, fileId, url, note, skipProof } = await req.json();

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true, title: true, status: true, projectId: true, managerId: true },
    });
    if (!task) throw new ApiError("Task not found", 404);

    let delivery = null;
    if (!skipProof) {
      if (!METHODS.includes(method)) throw new ApiError("Invalid delivery method", 400);
      delivery = await prisma.taskDelivery.create({
        data: {
          taskId: id,
          method,
          fileId: fileId || null,
          url: url?.trim() || null,
          note: note?.trim() || null,
          deliveredById: user.id,
        },
        include: {
          deliveredBy: { select: { id: true, name: true } },
          file: { select: { id: true, name: true, url: true } },
        },
      });
    }

    if (task.status !== "DONE") {
      await prisma.task.update({ where: { id }, data: { status: "DONE", progress: 100 } });
      await logStatus({
        organizationId: user.organizationId,
        entityType: "TASK",
        entityId: id,
        from: task.status,
        to: "DONE",
        userId: user.id,
        note: skipProof
          ? "completed (proof skipped)"
          : `completed — delivered via ${String(method).toLowerCase().replace("_", " ")}`,
      });
      // Resolve open change requests on completion.
      await prisma.changeRequest.updateMany({
        where: { taskId: id, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      if (task.managerId && task.managerId !== user.id) {
        await notify({
          organizationId: user.organizationId,
          userId: task.managerId,
          type: "TASK_COMPLETED",
          title: `"${task.title}" was completed`,
          body: `${user.name} marked the task done.`,
          link: task.projectId ? `/projects/${task.projectId}?task=${id}` : `/tasks?task=${id}`,
        });
      }
    }

    return NextResponse.json({ success: true, delivery }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/delivery");
  }
}
