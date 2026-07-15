import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/tasks/[id]/comments/[commentId]
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: taskId, commentId } = await params;
  try {
    const user = await requireAuth(req);

    // Verify the comment's parent task belongs to the caller's org.
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, taskId, task: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!comment) throw new ApiError("Comment not found", 404);

    await prisma.comment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/tasks/[id]/comments/[commentId]");
  }
}
