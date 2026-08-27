import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { mayReadAvailability, maySetAvailability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { dayKey, expandRange, validateReason } from "@/lib/availability";

const KINDS = new Set(["SHOOT", "LEAVE", "SICK", "OTHER_CLIENT", "OTHER"]);

/**
 * GET /api/availability?userId=&from=&to=
 *
 * Days people cannot be given work, for the window asked for.
 *
 * Omit `userId` and you get the whole team's, which is the view an SMM needs
 * when deciding who shoots on Tuesday. Anyone without content.plan gets only
 * their own, whatever they ask for — narrowed silently rather than refused,
 * because a junior opening their own calendar has done nothing wrong.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requested = searchParams.get("userId") ?? "";
    const seesTeam = can(user, "content.plan");
    // No userId means "everyone" for a planner and "me" for everybody else.
    const scopeToUser = requested || (seesTeam ? "" : user.id);

    if (scopeToUser && !mayReadAvailability(user, scopeToUser)) {
      throw new ApiError("You can only see your own availability", 403);
    }

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const rows = await prisma.unavailability.findMany({
      where: {
        organizationId: user.organizationId,
        ...(scopeToUser ? { userId: scopeToUser } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: dayKey(from) } : {}),
                ...(to ? { lte: dayKey(to) } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true, userId: true, date: true, kind: true, reason: true, createdAt: true,
        user: { select: { id: true, name: true, avatarUrl: true, jobTitle: { select: { name: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error, "GET /api/availability");
  }
}

/**
 * POST /api/availability   { userId?, from, to?, kind?, reason }
 *
 * Block a day, or a run of days.
 *
 * Takes a range because "I'm away the 4th to the 10th" is one thought, and
 * writes a row per day because every assignment check is then a lookup rather
 * than an overlap query. Re-blocking a day already blocked updates it instead
 * of failing: correcting your own reason should not require deleting first.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `availability:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const body = await req.json();
    const targetUserId: string = body?.userId || user.id;

    if (!maySetAvailability(user, targetUserId)) {
      throw new ApiError(
        "Only the person themselves, or an admin, can mark someone unavailable",
        403,
      );
    }

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!target) throw new ApiError("Person not found", 404);

    if (!body?.from) throw new ApiError("A start date is required", 400);
    const days = expandRange(body.from, body.to || body.from);
    if (days.length === 0) {
      throw new ApiError("That date range ends before it starts", 400);
    }

    const reasonCheck = validateReason(body?.reason);
    if (!reasonCheck.ok) throw new ApiError(reasonCheck.error, 400);

    const kind = KINDS.has(body?.kind) ? body.kind : "OTHER";

    // upsert per day: blocking a day twice corrects it rather than erroring.
    await prisma.$transaction(
      days.map((date) =>
        prisma.unavailability.upsert({
          where: { userId_date: { userId: target.id, date } },
          create: {
            organizationId: user.organizationId,
            userId: target.id,
            date,
            kind,
            reason: reasonCheck.reason,
            createdById: user.id,
          },
          update: { kind, reason: reasonCheck.reason, createdById: user.id },
        }),
      ),
    );

    const created = await prisma.unavailability.findMany({
      where: { userId: target.id, date: { in: days } },
      select: {
        id: true, userId: true, date: true, kind: true, reason: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ blocked: created.length, days: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/availability");
  }
}
