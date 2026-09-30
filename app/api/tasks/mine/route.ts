import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

/**
 * GET /api/tasks/mine — the signed-in person's own assigned work, for the
 * dashboard "My Tasks" widget.
 *
 * Scoped to THIS user's assignments (not taskVisibilityScope, which for a
 * manager is the whole org) so the widget answers "what is on my plate",
 * exactly what a junior opens the dashboard to see. It carries the viewer's
 * own acceptance state so the card can flag the ones still waiting on a
 * yes/no — a person should not have to hunt a task down to find out it needs
 * accepting.
 *
 * Declined assignments are left out: the person has already answered and the
 * work is being reassigned, so it is no longer theirs to do. Done tasks are
 * left out for the same reason a to-do list drops finished items.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rows = await prisma.taskAssignee.findMany({
      where: {
        userId: user.id,
        acceptance: { not: "DECLINED" },
        task: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { not: "DONE" },
        },
      },
      select: {
        acceptance: true,
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            projectId: true,
            project: { select: { name: true, client: { select: { name: true } } } },
            client: { select: { name: true } },
          },
        },
      },
    });

    const tasks = rows.map((r) => ({
      id: r.task.id,
      title: r.task.title,
      status: r.task.status,
      priority: r.task.priority,
      dueDate: r.task.dueDate ? r.task.dueDate.toISOString() : null,
      projectId: r.task.projectId,
      // A task hangs off a project's client, or a client directly, or neither.
      clientName: r.task.project?.client?.name ?? r.task.client?.name ?? null,
      projectName: r.task.project?.name ?? null,
      acceptance: r.acceptance,
    }));

    // Unanswered first — those need a decision before anything else. Then by
    // due date, soonest first, with undated work last. A stable title tie-break
    // keeps the order from jittering between refreshes.
    const rank = (a: string) => (a === "PENDING" ? 0 : 1);
    const due = (d: string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
    tasks.sort(
      (a, b) =>
        rank(a.acceptance) - rank(b.acceptance) ||
        due(a.dueDate) - due(b.dueDate) ||
        a.title.localeCompare(b.title),
    );

    return NextResponse.json({
      tasks,
      pendingCount: tasks.filter((t) => t.acceptance === "PENDING").length,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/mine");
  }
}
