import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { maySetAvailability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { dayKey, expandRange, validateReason } from "@/lib/availability";

const KINDS = new Set(["SHOOT", "LEAVE", "SICK", "OTHER_CLIENT", "OTHER"]);

/**
 * GET /api/availability?userId=&from=&to=
 *
 * Days people cannot be given work, for the window asked for.
 *
 * Omit `userId` and you get the whole team's — for everybody, not only
 * planners. A blocked day is what the rest of the team schedules around: the
 * editor waiting on footage and the SMM promising a client a date both need
 * to know the photographer is out on the 4th. Keeping that behind
 * content.plan meant the people doing the scheduling were the ones who
 * couldn't see it.
 *
 * Nothing private travels with it. The reason on a block was written for this
 * audience; a day that came from approved leave says "On approved leave" and
 * the real reason stays on the request, where only the approver reads it.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requested = searchParams.get("userId") ?? "";
    // No userId means everyone, for everyone. The org filter below is what
    // keeps this inside the tenant.
    const scopeToUser = requested;

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
        // Whether this day came from approved leave. The page has to say
        // "Approved leave" rather than showing it as a block the person chose,
        // because the two are cleared in completely different ways and only
        // one of them is theirs to undo.
        leaveRequestId: true,
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
        targetUserId === user.id
          ? "Blocking your own days is for the shoot crew. For time off, ask for leave under People — an admin approves it and it blocks the days for you."
          : "Only an admin can mark somebody else unavailable.",
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
          update: {
            kind, reason: reasonCheck.reason, createdById: user.id,
            // Whoever writes a day explicitly now owns it, so it stops
            // belonging to the leave that may have created it. Without this,
            // a photographer who re-purposed a leave day as a shoot lost that
            // block when the leave was later revoked — and became quietly
            // bookable on a day he had a wedding.
            leaveRequestId: null,
          },
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
