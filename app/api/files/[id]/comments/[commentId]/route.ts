import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string; commentId: string }> };

async function assertCommentInOrg(
  commentId: string,
  fileId: string,
  organizationId: string
) {
  const comment = await prisma.fileComment.findFirst({
    where: { id: commentId, fileId, file: { organizationId } },
    select: { id: true },
  });
  if (!comment) throw new ApiError("Comment not found", 404);
}

// ── PATCH /api/files/[id]/comments/[commentId] ─────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id, commentId } = await params;
    await assertCommentInOrg(commentId, id, user.organizationId);

    const body = await req.json();

    const { status, body: commentBody } = body as {
      status?: "OPEN" | "RESOLVED";
      body?: string;
    };

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
    await assertCommentInOrg(commentId, id, user.organizationId);

    await prisma.fileComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/files/[id]/comments/[commentId]");
  }
}
