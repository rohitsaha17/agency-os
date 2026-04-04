import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; commentId: string }> };

// ── PATCH /api/files/[id]/comments/[commentId] ─────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { commentId } = await params;
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
    console.error("[PATCH /api/files/.../comments/[commentId]]", err);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/files/[id]/comments/[commentId] ────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { commentId } = await params;
    await prisma.fileComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/files/.../comments/[commentId]]", err);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
