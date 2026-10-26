import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { dayKey, dayString } from "@/lib/availability";
import {
  validateTitle, validateTimes, cleanLocation, MAX_PARTICIPANTS,
} from "@/lib/shoots";

/**
 * Shoots — named, timed outings team members go on, with one or more of them
 * on each.
 *
 * Separate from /api/availability (which is the day-level "cannot be assigned"
 * store leave writes to). A shoot has a time of day and many people; see
 * prisma Shoot. The assignment guard consults shoots, but nothing here writes
 * availability rows.
 */

type ShootRow = {
  id: string;
  title: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  location: string | null;
  createdBy: { id: string; name: string } | null;
  participants: { user: { id: string; name: string; avatarUrl: string | null } }[];
};

function shape(s: ShootRow) {
  return {
    id: s.id,
    title: s.title,
    date: dayString(s.date),
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    location: s.location,
    createdBy: s.createdBy,
    participants: s.participants.map((p) => p.user),
  };
}

const SELECT = {
  id: true, title: true, date: true, startMinute: true, endMinute: true,
  location: true,
  createdBy: { select: { id: true, name: true } },
  participants: {
    select: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { user: { name: "asc" } },
  },
} as const;

/**
 * GET /api/shoots?from=&to=
 *
 * Shoots in the window, for the whole team. Everyone sees them — a shoot is
 * exactly the kind of thing the rest of the team plans around, the same reason
 * team availability is not hidden behind a planning capability. The org filter
 * is what keeps this inside the tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const rows = await prisma.shoot.findMany({
      where: {
        organizationId: user.organizationId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: dayKey(from) } : {}),
                ...(to ? { lte: dayKey(to) } : {}),
              },
            }
          : {}),
      },
      select: SELECT,
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    });

    return NextResponse.json(rows.map(shape));
  } catch (error) {
    return handleApiError(error, "GET /api/shoots");
  }
}

/**
 * POST /api/shoots   { title, date, from, to, location?, userIds? }
 *
 * Book a shoot. `from`/`to` are "HH:MM" wall-clock; `date` is the day. You can
 * put yourself on it, colleagues, or both — if you name nobody, it is booked
 * for you. Anyone on the team may book one and add anyone else in the org: the
 * whole point is that one person can record "Harsh and I are out on the 4th"
 * without each of them having to file it separately.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `shoots:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const body = await req.json().catch(() => null);

    const titleCheck = validateTitle(body?.title);
    if (!titleCheck.ok) throw new ApiError(titleCheck.error, 400);

    if (!body?.date) throw new ApiError("Pick the date of the shoot", 400);
    const date = dayKey(String(body.date));

    const timeCheck = validateTimes(body?.from, body?.to);
    if (!timeCheck.ok) throw new ApiError(timeCheck.error, 400);

    // Participants: whoever was named, or just the booker. Deduped, capped, and
    // every one proven to be a real user in this org — no cross-tenant ids.
    const asked: string[] = Array.isArray(body?.userIds)
      ? body.userIds.filter((v: unknown): v is string => typeof v === "string" && !!v)
      : [];
    const ids = [...new Set(asked.length ? asked : [user.id])];
    if (ids.length === 0) throw new ApiError("Add at least one person to the shoot", 400);
    if (ids.length > MAX_PARTICIPANTS) {
      throw new ApiError(`A shoot can hold up to ${MAX_PARTICIPANTS} people`, 400);
    }

    const members = await prisma.user.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (members.length !== ids.length) {
      throw new ApiError("One or more of those people are not on your team", 400);
    }

    const created = await prisma.shoot.create({
      data: {
        organizationId: user.organizationId,
        title: titleCheck.title,
        date,
        startMinute: timeCheck.startMinute,
        endMinute: timeCheck.endMinute,
        location: cleanLocation(body?.location),
        createdById: user.id,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
      select: SELECT,
    });

    return NextResponse.json(shape(created), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/shoots");
  }
}
