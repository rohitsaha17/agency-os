import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isHeadOfDesign } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// GET /api/tasks/approvals — tasks pending Head-of-Design approval.
// Visible only to HEAD_OF_DESIGN designation + admins/owner.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!isHeadOfDesign(user)) {
      throw new ApiError("Only the Head of Design or an admin can view approvals", 403);
    }

    const tasks = await prisma.task.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        assignmentStatus: "PENDING_HEAD_APPROVAL",
      },
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        client: { select: { id: true, name: true } },
        preferredAssignee: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(tasks);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/approvals");
  }
}
