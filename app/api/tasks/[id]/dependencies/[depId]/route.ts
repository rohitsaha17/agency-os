import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string; depId: string }> };

// DELETE /api/tasks/[id]/dependencies/[depId]
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: taskId, depId: dependsOnId } = await params;
  try {
    const user = await requireAuth(req);

    // Verify the parent task belongs to the caller's org before removing.
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!task) throw new ApiError("Task not found", 404);

    await prisma.taskDependency.delete({
      where: { taskId_dependsOnId: { taskId, dependsOnId } },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Dependency not found", 404, "NOT_FOUND");
    }
    return handleApiError(error, "DELETE /api/tasks/[id]/dependencies/[depId]");
  }
}
