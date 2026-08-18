import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// PATCH /api/tasks/my-order — persist the caller's personal queue order.
// Body: { ids: string[] } (full desired order, first = top).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      throw new ApiError("ids must be an array of task ids", 400);
    }

    // Only reorder tasks that are truly the caller's (org + assigned to them).
    const mine = await prisma.task.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        organizationId: user.organizationId,
        assignees: { some: { userId: user.id } },
      },
      select: { id: true },
    });
    const mineSet = new Set(mine.map((t) => t.id));

    await prisma.$transaction(
      ids
        .filter((id: string) => mineSet.has(id))
        .map((id: string, index: number) =>
          prisma.task.update({ where: { id }, data: { sortOrder: index } }),
        ),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/tasks/my-order");
  }
}
