import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { notifyMany } from "@/lib/notify";
import { logStatus } from "@/lib/audit";
import {
  canRespond, canTransition, validateDeclineReason, declineAudience,
} from "@/lib/task-acceptance";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/acceptance   { action: "ACCEPT" | "DECLINE", reason? }
 *
 * The assignee answering the work they were handed.
 *
 * Guarded by holding the assignment, not by a capability: this is the one
 * action in the app where seniority grants nothing. A manager cannot mark
 * somebody else unavailable, because the reason recorded against it would be
 * the manager's words in that person's mouth. If a manager wants the work
 * moved, reassigning is the action that says so.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `tasks:acceptance:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;
    const body = await req.json();
    const action = body?.action === "DECLINE" ? "DECLINE" : body?.action === "ACCEPT" ? "ACCEPT" : null;
    if (!action) throw new ApiError("action must be ACCEPT or DECLINE", 400);

    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, title: true, projectId: true, managerId: true, approverId: true,
        assignees: { select: { userId: true, acceptance: true, assignedById: true } },
      },
    });
    if (!task) throw new ApiError("Task not found", 404);

    const mine = task.assignees.find((a) => a.userId === user.id);
    if (!canRespond(mine, user.id)) {
      throw new ApiError("This task isn't assigned to you", 403);
    }

    const to = action === "ACCEPT" ? "ACCEPTED" as const : "DECLINED" as const;
    if (!canTransition(mine!.acceptance, to)) {
      throw new ApiError(
        mine!.acceptance === "DECLINED"
          ? "You've already declined this. Ask whoever assigned it to hand it back."
          : "You've already accepted this one.",
        409,
      );
    }

    let reason: string | null = null;
    if (action === "DECLINE") {
      const check = validateDeclineReason(body?.reason);
      if (!check.ok) throw new ApiError(check.error, 400);
      reason = check.reason;
    }

    await prisma.taskAssignee.update({
      where: { taskId_userId: { taskId: task.id, userId: user.id } },
      data: {
        acceptance: to,
        respondedAt: new Date(),
        // Accepting clears any earlier reason so a stale one can't linger on
        // an assignment that is now under way.
        declineReason: reason,
      },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "TASK",
      entityId: task.id,
      to: action === "ACCEPT" ? "assignment accepted" : "assignment declined",
      userId: user.id,
      note: reason ?? undefined,
    });

    if (action === "DECLINE") {
      // The assigner's plan just changed, so they hear about it. The task's
      // manager and approver too when they're different people — on an
      // assignment made before assignedById existed they're the only ones who
      // would ever find out.
      const audience = declineAudience({
        assignedById: mine!.assignedById,
        managerId: task.managerId,
        approverId: task.approverId,
        decliningUserId: user.id,
      });
      await notifyMany(audience, {
        organizationId: user.organizationId,
        type: "TASK_DECLINED",
        title: `${user.name} can't take "${task.title}"`,
        body: reason ?? undefined,
        link: task.projectId ? `/projects/${task.projectId}?task=${task.id}` : `/tasks?task=${task.id}`,
      });
    }

    const updated = await prisma.task.findUnique({
      where: { id: task.id },
      select: {
        id: true,
        assignees: {
          select: {
            userId: true, acceptance: true, respondedAt: true, declineReason: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "POST /api/tasks/[id]/acceptance");
  }
}
