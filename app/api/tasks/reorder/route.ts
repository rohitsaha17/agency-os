import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// POST /api/tasks/reorder — update order for a list of task IDs
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { taskIds } = await req.json();
    if (!Array.isArray(taskIds)) {
      throw new ApiError("taskIds must be an array", 400);
    }

    // Verify every task belongs to the caller's org before reordering — otherwise
    // a caller could probe/reorder ids from other tenants by submitting a mixed batch.
    if (taskIds.length > 0) {
      const owned = await prisma.task.count({
        where: { id: { in: taskIds }, organizationId: user.organizationId },
      });
      if (owned !== taskIds.length) {
        throw new ApiError("One or more tasks not found", 404);
      }
    }

    await prisma.$transaction(
      taskIds.map((id: string, index: number) =>
        prisma.task.update({ where: { id }, data: { order: index } })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/reorder");
  }
}
