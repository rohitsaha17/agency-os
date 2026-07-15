import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string; commentId: string }> };

// ── POST /api/files/[id]/comments/[commentId]/task ─────────────
// Creates a Task from a file comment and links it back to the comment.

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: fileId, commentId } = await params;

    // Verify the comment (and its file) belong to the caller's org.
    const comment = await prisma.fileComment.findFirst({
      where: { id: commentId, fileId, file: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!comment) throw new ApiError("Comment not found", 404);

    const body = await req.json();

    const { title, projectId, priority } = body as {
      title: string;
      projectId: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    };

    if (!title?.trim()) {
      throw new ApiError("Task title is required", 400);
    }
    if (!projectId) {
      throw new ApiError("projectId is required", 400);
    }

    // Verify the target project belongs to the caller's org.
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    // Create the task
    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
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
    return handleApiError(err, "POST /api/files/[id]/comments/[commentId]/task");
  }
}
