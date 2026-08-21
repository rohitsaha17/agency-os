import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notifyMany } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

async function assertTaskInOrg(taskId: string, organizationId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId },
    select: { id: true },
  });
  if (!task) throw new ApiError("Task not found", 404);
}

/**
 * Everyone involved in a task: the people doing it, the SMM who briefed and
 * reviews it, and the manager on it. A comment posted into a thread nobody is
 * subscribed to is a note to yourself, which is what this was before.
 */
async function taskParticipants(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, projectId: true, approverId: true, managerId: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) return null;
  return {
    ...task,
    userIds: [
      ...task.assignees.map((a) => a.userId),
      task.approverId,
      task.managerId,
    ],
  };
}

// GET /api/tasks/[id]/comments?type=COMMENT|UPDATE
export async function GET(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

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
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/comments");
  }
}

// POST /api/tasks/[id]/comments
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

    const { body, type } = await req.json();
    if (!body?.trim()) {
      throw new ApiError("Comment body is required", 400);
    }
    // Author is always the authenticated caller — never client-supplied.
    const comment = await prisma.comment.create({
      data: {
        taskId,
        body: body.trim(),
        authorId: user.id,
        authorName: user.name,
        type: (type === "UPDATE" ? "UPDATE" : "COMMENT") as never,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    // Tell everyone on the task except whoever just wrote it.
    const participants = await taskParticipants(taskId);
    if (participants) {
      await notifyMany(
        participants.userIds.filter((uid) => uid && uid !== user.id),
        {
          organizationId: user.organizationId,
          type: "TASK_COMMENT",
          title: `${user.name} commented on "${participants.title}"`,
          body: body.trim().slice(0, 160),
          link: participants.projectId
            ? `/projects/${participants.projectId}?task=${taskId}`
            : `/tasks?task=${taskId}`,
        },
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/comments");
  }
}
