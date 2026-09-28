import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/** Enough to answer "what happened here" without becoming a data export. */
const LIMIT = 200;

/**
 * GET /api/projects/[id]/activity — what has happened to this project.
 *
 * Every status change recorded against the project itself, against any of its
 * tasks, and against any content item planned on it: who made it, when, what
 * it went from and to, and whatever note the code that logged it left.
 *
 * WHY THIS READS WELL AND WAS NOT WRITTEN FOR IT
 *
 * status_history has been filled in on every transition since v2 — task
 * created, work submitted, cycle closed, assignment approved — but nothing
 * had ever read it except a single task's own panel. The history of a project
 * was sitting in the database with no way to look at it.
 *
 * Titles are resolved here rather than stored on the row, because a task that
 * is renamed should read under its current name; a log that shows what
 * something used to be called is harder to follow, not more faithful.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "activity.view");
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    // The ids this project's history can be attached to. Deleted tasks are
    // included on purpose: "who deleted it" is exactly the kind of question
    // this page exists to answer, and dropping them would hide it.
    const [tasks, items] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: id, organizationId: user.organizationId },
        select: { id: true, title: true },
      }),
      prisma.contentItem.findMany({
        where: { projectId: id, organizationId: user.organizationId },
        select: { id: true, topic: true },
      }),
    ]);

    const titleById = new Map<string, string>([
      [project.id, project.name],
      ...tasks.map((t) => [t.id, t.title] as [string, string]),
      ...items.map((c) => [c.id, c.topic] as [string, string]),
    ]);

    const rows = await prisma.statusHistory.findMany({
      where: {
        organizationId: user.organizationId,
        entityId: { in: [...titleById.keys()] },
      },
      select: {
        id: true, entityType: true, entityId: true,
        fromStatus: true, toStatus: true, note: true, changedAt: true,
        changedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { changedAt: "desc" },
      take: LIMIT,
    });

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      entries: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        /** Null when the row predates the thing it refers to being nameable. */
        title: titleById.get(r.entityId) ?? null,
        from: r.fromStatus,
        to: r.toStatus,
        note: r.note,
        at: r.changedAt.toISOString(),
        /** Null where the change was made by the system, or by a deleted user. */
        by: r.changedBy,
      })),
      /** So the page can say it is showing a window rather than everything. */
      truncated: rows.length === LIMIT,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/activity");
  }
}
