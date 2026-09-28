import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";

/** A page. Enough to read, small enough to render without thinking about it. */
const PAGE = 100;

/**
 * GET /api/activity — everything that has happened in this workspace.
 *
 *   ?userId=<id>       only this person's changes
 *   ?entityType=TASK   only tasks / projects / plans
 *   ?q=<text>          matches the note, or the name of what changed
 *   ?from / ?to        YYYY-MM-DD, inclusive
 *   ?cursor=<id>       the next page
 *
 * WHY THE SEARCH IS DONE THE WAY IT IS
 *
 * status_history stores an entity id, not a name. So "show me everything to
 * do with LOGO DESIGN" cannot be a WHERE on this table — the words are in
 * tasks, projects and content_items. The matching ids are looked up first and
 * the log is then filtered by them, which is two queries rather than a join
 * across three tables whose only shared column is a string id with no foreign
 * key behind it.
 *
 * Titles are resolved the same way, after the page is chosen, so a renamed
 * task reads under its current name.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "activity.view");

    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId") || undefined;
    const entityType = sp.get("entityType") || undefined;
    const q = (sp.get("q") || "").trim();
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;
    const cursor = sp.get("cursor") || undefined;

    let matchingIds: string[] | undefined;
    if (q) {
      const [tasks, projects, items] = await Promise.all([
        prisma.task.findMany({
          where: { organizationId: user.organizationId, title: { contains: q, mode: "insensitive" } },
          select: { id: true }, take: 500,
        }),
        prisma.project.findMany({
          where: { organizationId: user.organizationId, name: { contains: q, mode: "insensitive" } },
          select: { id: true }, take: 500,
        }),
        prisma.contentItem.findMany({
          where: { organizationId: user.organizationId, topic: { contains: q, mode: "insensitive" } },
          select: { id: true }, take: 500,
        }),
      ]);
      matchingIds = [...tasks, ...projects, ...items].map((r) => r.id);
    }

    const where = {
      organizationId: user.organizationId,
      ...(userId && { changedById: userId }),
      ...(entityType && { entityType }),
      ...(from || to
        ? {
            changedAt: {
              ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
              // Inclusive: "to 28 Sep" means the whole of the 28th.
              ...(to && { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) }),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: "insensitive" as const } },
              // matchingIds is [] when nothing matched, which correctly
              // returns nothing rather than everything.
              { entityId: { in: matchingIds ?? [] } },
            ],
          }
        : {}),
    };

    const rows = await prisma.statusHistory.findMany({
      where,
      select: {
        id: true, entityType: true, entityId: true,
        fromStatus: true, toStatus: true, note: true, changedAt: true,
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const page = rows.slice(0, PAGE);
    const ids = [...new Set(page.map((r) => r.entityId))];

    const [tasks, projects, items] = await Promise.all([
      prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, projectId: true } }),
      prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      prisma.contentItem.findMany({ where: { id: { in: ids } }, select: { id: true, topic: true, projectId: true } }),
    ]);
    const titles = new Map<string, { title: string; projectId?: string | null }>([
      ...tasks.map((t) => [t.id, { title: t.title, projectId: t.projectId }] as const),
      ...projects.map((p) => [p.id, { title: p.name, projectId: p.id }] as const),
      ...items.map((c) => [c.id, { title: c.topic, projectId: c.projectId }] as const),
    ]);

    return NextResponse.json({
      entries: page.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        title: titles.get(r.entityId)?.title ?? null,
        projectId: titles.get(r.entityId)?.projectId ?? null,
        from: r.fromStatus,
        to: r.toStatus,
        note: r.note,
        at: r.changedAt.toISOString(),
        by: r.changedBy,
      })),
      /** The id to ask for the next page with, or null at the end. */
      nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/activity");
  }
}
