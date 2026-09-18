import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { dayKey, dayString, loadKey } from "@/lib/availability";

/** A quarter is the most anyone plans at once, and it caps the query. */
const MAX_DAYS = 92;

/**
 * GET /api/availability/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The whole resource grid in one request: everyone on the team, every block in
 * the window, and how much work is due on each of them each day.
 *
 * ONE request on purpose. The page it feeds is people down the side and dates
 * across the top, so the obvious implementations — a call per day, or worse a
 * call per person per day — would be fifty to a thousand round trips for one
 * screen, and every arrow-key press on the date would fire them all again.
 * Three queries, fixed, whatever the window.
 *
 * This is NOT a second copy of /api/availability/day. That endpoint answers
 * one date and carries the task titles the assignee picker needs; this one
 * answers a range and carries counts. They are kept apart rather than merged
 * because /day is a planner's tool behind content.plan, and this page is one
 * everybody is allowed to open.
 *
 * WHICH IS WHY THE PAYLOAD IS IN TWO HALVES:
 *
 *   blocks — everybody sees them. A blocked day is the fact the whole team
 *            schedules around, and it is already public through
 *            GET /api/availability.
 *   load   — content.plan only, exactly as on /day. How loaded each colleague
 *            is is what a planner needs and not something a junior has any
 *            call to enumerate. Absent, not zeroed: a nulled-out map tells the
 *            client to say "Available" rather than to claim "0 jobs".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const fromRaw = sp.get("from");
    const toRaw = sp.get("to");
    if (!fromRaw || !toRaw) throw new ApiError("A from and to date are required", 400);

    const from = dayKey(fromRaw);
    const to = dayKey(toRaw);
    if (to < from) throw new ApiError("That range ends before it starts", 400);

    const span = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (span > MAX_DAYS) throw new ApiError(`Ask for at most ${MAX_DAYS} days at a time`, 400);

    // Exclusive upper bound, so a task due at 6pm on the last day still counts.
    const end = new Date(to);
    end.setUTCDate(end.getUTCDate() + 1);

    const seesLoad = can(user, "content.plan");

    const [people, blocks, due] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: {
          id: true, name: true, avatarUrl: true, role: true,
          jobTitle: { select: { id: true, name: true, blocksOwnDays: true, sortOrder: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.unavailability.findMany({
        where: { organizationId: user.organizationId, date: { gte: from, lte: to } },
        select: {
          id: true, userId: true, date: true, kind: true, reason: true,
          leaveRequestId: true, createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { date: "asc" },
      }),
      // Finished work is not load. Counting a task somebody closed on Monday
      // would make a productive week look full, which is the opposite of what
      // this screen is for.
      seesLoad
        ? prisma.taskAssignee.findMany({
            where: {
              task: {
                organizationId: user.organizationId,
                deletedAt: null,
                status: { not: "DONE" },
                dueDate: { gte: from, lt: end },
              },
            },
            select: { userId: true, task: { select: { dueDate: true } } },
          })
        : Promise.resolve([]),
    ]);

    // "userId|YYYY-MM-DD" -> count. A flat map rather than nesting, so the
    // grid looks a cell up in one go instead of walking two objects.
    const load: Record<string, number> | null = seesLoad ? {} : null;
    if (load) {
      for (const row of due) {
        if (!row.task.dueDate) continue;
        const k = loadKey(row.userId, row.task.dueDate);
        load[k] = (load[k] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      from: dayString(from),
      to: dayString(to),
      /** Tells the client to say "Available" rather than invent "0 jobs". */
      seesLoad,
      /** Drives which buttons the page offers — the server still decides. */
      canBlockOthers: can(user, "users.manage"),
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        role: p.role,
        craft: p.jobTitle?.name ?? null,
        craftId: p.jobTitle?.id ?? null,
        craftOrder: p.jobTitle?.sortOrder ?? 999,
        blocksOwnDays: !!p.jobTitle?.blocksOwnDays,
      })),
      blocks: blocks.map((b) => ({
        id: b.id,
        userId: b.userId,
        date: dayString(b.date),
        kind: b.kind,
        reason: b.reason,
        /** Approved leave, not a day the person chose. Cleared by revoking. */
        leave: b.leaveRequestId !== null,
        createdBy: b.createdBy,
        createdAt: b.createdAt.toISOString(),
      })),
      load,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/availability/overview");
  }
}
