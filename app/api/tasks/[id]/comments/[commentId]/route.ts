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
      select: { id: true, authorId: true },
    });
    if (!comment) throw new ApiError("Comment not found", 404);

    // QA-013: only the author may delete their own comment; admins/owners may
    // moderate. Being in the same org is not enough — the check was missing, so
    // anyone could delete anyone's comment by id.
    const isModerator = user.role === "OWNER" || user.role === "ADMIN";
    if (comment.authorId !== user.id && !isModerator) {
      throw new ApiError("You can only delete your own comment", 403);
    }

    await prisma.comment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/tasks/[id]/comments/[commentId]");
  }
}
