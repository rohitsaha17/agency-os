import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/tasks/[id]/comments/[commentId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { commentId } = await params;
  try {
    await prisma.comment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
