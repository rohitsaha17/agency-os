import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { taskVisibilityScope } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * POST/DELETE /api/tasks/[id]/star — pin a task to your own list, or unpin it.
 *
 * Always your own star. There is no userId in the body and no way to star on
 * somebody else's behalf: a pin is a note you made to yourself about a task,
 * and rearranging a colleague's list is not a thing anybody should be able to
 * do by accident.
 *
 * You can only star what you can already see. The same taskVisibilityScope
 * the list uses, so a junior cannot probe for the existence of other people's
 * work by starring ids and watching which ones succeed.
 */
async function assertVisible(userId: string, orgId: string, taskId: string, user: Parameters<typeof taskVisibilityScope>[0]) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId, deletedAt: null, organizationId: orgId,
      AND: [taskVisibilityScope(user)],
    },
    select: { id: true },
  });
  if (!task) throw new ApiError("Task not found", 404);
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertVisible(user.id, user.organizationId, id, user);

    // Starring twice is pressing the button twice, not an error.
    await prisma.taskStar.upsert({
      where: { taskId_userId: { taskId: id, userId: user.id } },
      create: { taskId: id, userId: user.id },
      update: {},
    });
    return NextResponse.json({ starred: true });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/star");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    // deleteMany rather than delete: unstarring something that was never
    // starred is the same outcome the caller wanted, not a 404.
    await prisma.taskStar.deleteMany({ where: { taskId: id, userId: user.id } });
    return NextResponse.json({ starred: false });
  } catch (error) {
    return handleApiError(error, "DELETE /api/tasks/[id]/star");
  }
}
