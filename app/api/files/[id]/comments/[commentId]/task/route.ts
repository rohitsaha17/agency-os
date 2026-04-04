import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; commentId: string }> };

// ── POST /api/files/[id]/comments/[commentId]/task ─────────────
// Creates a Task from a file comment and links it back to the comment.

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { commentId } = await params;
    const body = await req.json();

    const { title, projectId, priority } = body as {
      title: string;
      projectId: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    };

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Task title is required" },
        { status: 400 }
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        projectId,
        title: title.trim(),
        priority: priority ?? "MEDIUM",
        status: "TODO",
      },
    });

    // Link the task to the comment
    await prisma.fileComment.update({
      where: { id: commentId },
      data: { taskId: task.id },
    });

    return NextResponse.json(
      { taskId: task.id, taskTitle: task.title },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/files/.../comments/[commentId]/task]", err);
    return NextResponse.json(
      { error: "Failed to create task from comment" },
      { status: 500 }
    );
  }
}
