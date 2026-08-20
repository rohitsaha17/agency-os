import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { approve, requestChanges, roundHistory } from "@/lib/review-loop";
import { can } from "@/lib/permissions";

/**
 * POST /api/tasks/[id]/review — the approver's verdict on the current round.
 *
 * Body: { decision: "APPROVED" | "CHANGES_REQUESTED", comments? }
 *
 * Approving creates the posting task; requesting changes reopens the SAME
 * task as the next round (docs/V3_CONTEXT.md §3).
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true, status: true, approverId: true,
        project: { select: { members: { select: { userId: true, role: true } } } },
      },
    });
    if (!task) throw new ApiError("Task not found", 404);

    // An SMM reviews the projects they're on. Admin and manager can review
    // anything — someone has to cover when an SMM is away.
    const ownsProject =
      task.approverId === user.id ||
      (task.project?.members ?? []).some((m) => m.userId === user.id && m.role === "SMM");
    requireCapability(user, "tasks.review", { ownsProject });

    if (task.status !== "IN_REVIEW") {
      throw new ApiError("This task hasn't been submitted for review", 409);
    }

    const { decision, comments } = await req.json();

    if (decision === "APPROVED") {
      const result = await approve({
        taskId: id,
        organizationId: user.organizationId,
        userId: user.id,
        comments,
      });
      return NextResponse.json({ ...result, rounds: await roundHistory(id) });
    }

    if (decision === "CHANGES_REQUESTED") {
      const result = await requestChanges({
        taskId: id,
        organizationId: user.organizationId,
        userId: user.id,
        comments,
      });
      return NextResponse.json({ ...result, rounds: await roundHistory(id) });
    }

    throw new ApiError("decision must be APPROVED or CHANGES_REQUESTED", 400);
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/review");
  }
}

/** GET — the round trail, for the drawer's history. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!task) throw new ApiError("Task not found", 404);
    return NextResponse.json({ rounds: await roundHistory(id) });
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/review");
  }
}
