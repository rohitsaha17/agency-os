import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// GET /api/tasks/[id]/history — StatusHistory entries, newest first
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const history = await prisma.statusHistory.findMany({
      where: { entityType: "TASK", entityId: id, organizationId: user.organizationId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: "desc" },
      take: 50,
    });
    return NextResponse.json(history);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/history");
  }
}
