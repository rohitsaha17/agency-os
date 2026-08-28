import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { dayKey } from "@/lib/availability";

/**
 * GET /api/availability/day?date=YYYY-MM-DD
 *
 * For one day: who is blocked, and how much everyone else already has on.
 *
 * This is the question actually being asked at the moment of assigning —
 * "can Vikram shoot on the 4th?" — and it has two halves that the assigner
 * needs together. Blocked is a hard no. Load is a number they weigh: a
 * photographer with two shoots that day can physically take a third, and
 * whether they should is a judgement no rule should make for them.
 *
 * Deliberately one request for the whole team rather than one per person.
 * The picker needs every row at once to be useful, and a fan-out of ten
 * requests every time somebody changes the date would be worse for everyone.
 *
 * Gated on content.plan: this is a planner's tool, and it reveals how loaded
 * each colleague is. That is exactly what a planner needs and not something a
 * junior has any call to enumerate.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");

    const raw = req.nextUrl.searchParams.get("date");
    if (!raw) throw new ApiError("A date is required", 400);
    const day = dayKey(raw);

    // The whole day, in server time, for counting what is due on it.
    const start = new Date(day);
    const end = new Date(day);
    end.setUTCDate(end.getUTCDate() + 1);

    const [people, blocks, due] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true, name: true, jobTitle: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.unavailability.findMany({
        where: { organizationId: user.organizationId, date: day },
        select: { userId: true, kind: true, reason: true },
      }),
      // What is already due on them that day. DONE work is not load — it is
      // finished, and counting it would make a productive week look full.
      prisma.taskAssignee.findMany({
        where: {
          task: {
            organizationId: user.organizationId,
            deletedAt: null,
            status: { not: "DONE" },
            dueDate: { gte: start, lt: end },
          },
        },
        select: {
          userId: true,
          // Only fields that exist. `creativeTypeName` was invented here and
          // threw at runtime: Prisma's nested select types accept unknown
          // keys, so tsc passed and the endpoint 500'd on the first real call.
          task: { select: { id: true, title: true, kind: true } },
        },
      }),
    ]);

    const blockByUser = new Map(blocks.map((b) => [b.userId, b]));
    const loadByUser = new Map<string, { id: string; title: string }[]>();
    for (const d of due) {
      if (!loadByUser.has(d.userId)) loadByUser.set(d.userId, []);
      loadByUser.get(d.userId)!.push({ id: d.task.id, title: d.task.title });
    }

    return NextResponse.json({
      date: day.toISOString().slice(0, 10),
      people: people.map((p) => {
        const blocked = blockByUser.get(p.id);
        const load = loadByUser.get(p.id) ?? [];
        return {
          id: p.id,
          name: p.name,
          craft: p.jobTitle?.name ?? null,
          blocked: blocked ? { kind: blocked.kind, reason: blocked.reason } : null,
          load: load.length,
          // The titles, so the picker can say WHAT they are already on rather
          // than only how many things.
          on: load.slice(0, 4).map((t) => t.title),
        };
      }),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/availability/day");
  }
}
