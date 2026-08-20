import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { submit, roundHistory, type SubmissionMethod } from "@/lib/review-loop";

/**
 * POST /api/tasks/[id]/submit — the assignee hands work in with proof.
 *
 * Body: { method, url?, fileId?, remarks? }
 */

type Params = { params: Promise<{ id: string }> };

const METHODS: SubmissionMethod[] = ["LINK", "FILE_UPLOAD", "WHATSAPP", "SLACK", "OTHER"];

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    // Only the person holding the task may submit it. (Admins can too —
    // someone has to be able to unstick a task when a junior is away.)
    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assignees: { select: { userId: true } } },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const isAssignee = task.assignees.some((a) => a.userId === user.id);
    const isAdmin = user.role === "ADMIN" || user.role === "OWNER";
    if (!isAssignee && !isAdmin) {
      throw new ApiError("Only the person assigned to this task can submit it", 403);
    }

    const { method, url, fileId, remarks } = await req.json();
    if (!METHODS.includes(method)) throw new ApiError("Pick how the work was delivered", 400);

    const result = await submit({
      taskId: id,
      organizationId: user.organizationId,
      userId: user.id,
      method,
      url,
      fileId,
      remarks,
    });

    return NextResponse.json({ ...result, rounds: await roundHistory(id) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/submit");
  }
}
