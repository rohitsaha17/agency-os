import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/tasks/[id]/comments?type=COMMENT|UPDATE
export async function GET(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "COMMENT" | "UPDATE" | null (all)

    const comments = await prisma.comment.findMany({
      where: { taskId, ...(type ? { type: type as never } : {}) },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(comments);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/tasks/[id]/comments
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const { body, authorName, type } = await req.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }
    const comment = await prisma.comment.create({
      data: {
        taskId,
        body: body.trim(),
        authorName: authorName?.trim() || "Anonymous",
        type: (type === "UPDATE" ? "UPDATE" : "COMMENT") as never,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
