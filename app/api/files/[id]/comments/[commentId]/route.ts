import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

type Params = { params: Promise<{ id: string; commentId: string }> };

async function loadCommentInOrg(
  commentId: string,
  fileId: string,
  organizationId: string
): Promise<{ id: string; authorId: string | null }> {
  const comment = await prisma.fileComment.findFirst({
    where: { id: commentId, fileId, file: { organizationId } },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new ApiError("Comment not found", 404);
  return comment;
}

// ── PATCH /api/files/[id]/comments/[commentId] ─────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id, commentId } = await params;
    const comment = await loadCommentInOrg(commentId, id, user.organizationId);

    const body = await req.json();

    const { status, body: commentBody } = body as {
      status?: "OPEN" | "RESOLVED";
      body?: string;
    };

    // QA-013: editing the comment TEXT is the author's right (admins moderate).
    // Resolving/reopening a thread is a review action, so a planner may also do
    // it. Neither was checked, so anyone could rewrite another user's comment.
    const isAuthor = comment.authorId === user.id;
    const isModerator = user.role === "OWNER" || user.role === "ADMIN";
    if (commentBody !== undefined && !(isAuthor || isModerator)) {
      throw new ApiError("You can only edit your own comment", 403);
    }
    if (status !== undefined && !(isAuthor || isModerator || can(user, "content.plan"))) {
      throw new ApiError("You can't change this comment's status", 403);
    }

    const updated = await prisma.fileComment.update({
      where: { id: commentId },
      data: {
        ...(status !== undefined && { status }),
        ...(commentBody !== undefined && { body: commentBody }),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { id: true, title: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err, "PATCH /api/files/[id]/comments/[commentId]");
  }
}

// ── DELETE /api/files/[id]/comments/[commentId] ────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id, commentId } = await params;
    const comment = await loadCommentInOrg(commentId, id, user.organizationId);

    // QA-013: author-or-moderator only, same as task comments.
    const isModerator = user.role === "OWNER" || user.role === "ADMIN";
    if (comment.authorId !== user.id && !isModerator) {
      throw new ApiError("You can only delete your own comment", 403);
    }

    await prisma.fileComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/files/[id]/comments/[commentId]");
  }
}
