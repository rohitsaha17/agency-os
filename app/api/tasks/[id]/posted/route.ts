import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { markPosted } from "@/lib/review-loop";

/**
 * POST /api/tasks/[id]/posted — the POST task is done; the content is live.
 *
 * Body: { liveUrl? }
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, kind: true, assignees: { select: { userId: true } } },
    });
    if (!task) throw new ApiError("Task not found", 404);
    if (task.kind !== "POST") {
      throw new ApiError("This isn't a posting task", 400);
    }

    const isAssignee = task.assignees.some((a) => a.userId === user.id);
    const isAdmin = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER";
    if (!isAssignee && !isAdmin) {
      throw new ApiError("Only the person posting this can close it", 403);
    }

    const { liveUrl } = await req.json().catch(() => ({ liveUrl: null }));
    const result = await markPosted({
      taskId: id,
      organizationId: user.organizationId,
      userId: user.id,
      liveUrl,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/posted");
  }
}
