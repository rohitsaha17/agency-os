import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { dayKey, dayString, canSelfCheckIn, attendanceDay } from "@/lib/hr";

/**
 * GET /api/hr/attendance?month=YYYY-MM[&userId=…|&scope=team]
 *
 * Which days somebody was in. Defaults to the caller's own record, which is
 * why there is no capability on the default path — everybody may see their
 * own attendance, and asking about ANYONE ELSE is the thing that needs
 * hr.records. Not hr.today: seeing who is in right now is part of handing
 * out work, reading back somebody's August is not.
 *
 * `scope=team` is the month-end grid: everybody, plus the names to put down
 * the side. The names ship with the rows rather than leaving the grid to
 * fetch /api/hr/staff separately — that would be a second round trip for
 * data this query already knows it needs, at ~130ms a trip in production.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month");
    const askedFor = sp.get("userId");
    const team = sp.get("scope") === "team";

    // The month grid and anybody else's record are the personnel file, not
    // the daily board — hr.today is not enough for either.
    if (team || (askedFor && askedFor !== user.id)) requireCapability(user, "hr.records");
    const userId = askedFor ?? user.id;
    /** Everybody, or exactly one person. */
    const who = team ? {} : { userId };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiError("A month is required, as YYYY-MM", 400);
    }
    const [y, m] = month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const [days, leave, people] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          organizationId: user.organizationId,
          ...who,
          date: { gte: from, lt: to },
        },
        select: {
          id: true, userId: true, date: true, checkedInAt: true,
          note: true, source: true,
        },
        orderBy: { date: "asc" },
      }),
      // Approved leave in the same window, so a blank day can say WHY it is
      // blank. An absence with a reason is a different fact from an absence.
      prisma.leaveRequest.findMany({
        where: {
          organizationId: user.organizationId,
          ...who,
          status: "APPROVED",
          startDate: { lt: to },
          endDate: { gte: from },
        },
        select: { userId: true, startDate: true, endDate: true, kind: true },
      }),
      // Only for the grid. One person looking at their own month already
      // knows whose it is.
      team
        ? prisma.user.findMany({
            where: { organizationId: user.organizationId, isActive: true },
            select: {
              id: true, name: true, avatarUrl: true,
              jobTitle: { select: { name: true } },
            },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      month,
      people: people.map((p) => ({
        id: p.id, name: p.name, avatarUrl: p.avatarUrl,
        craft: p.jobTitle?.name ?? null,
      })),
      days: days.map((d) => ({
        ...d,
        date: dayString(d.date),
        checkedInAt: d.checkedInAt.toISOString(),
      })),
      leave: leave.map((l) => ({
        userId: l.userId,
        start: dayString(l.startDate),
        end: dayString(l.endDate),
        kind: l.kind,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/attendance");
  }
}

/**
 * POST /api/hr/attendance — "I'm in."
 *
 * The whole feature, and it is deliberately one button. There is no
 * check-out and no duration, because nobody here is paid by the hour; this
 * answers "who is in today" so work can be handed out, and "was this person
 * here" when the month is reviewed.
 *
 * Two callers, one route:
 *   - yourself, today. Anybody may do this.
 *   - somebody else, or an earlier day. hr.manage, and the row is stamped
 *     ADMIN with who recorded it, so a record added on someone's behalf
 *     never reads as though they checked in themselves.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "attendance.mark");

    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
    const forUser: string = body.userId || user.id;
    // The working day in the ORG's timezone, 6am to 6am — not the server's
    // midnight, which on Vercel is UTC and would roll an Indian team over to
    // tomorrow at half past five in the evening.
    const tz = user.organization?.timezone ?? "UTC";
    const today = attendanceDay(new Date(), tz);
    const forDate = body.date ? dayKey(body.date) : dayKey(today);

    const onBehalf = forUser !== user.id || dayString(forDate) !== today;
    if (onBehalf) {
      requireCapability(user, "hr.manage");
      // Whoever it is for has to be in this org — an id from elsewhere must
      // not create a row here.
      const member = await prisma.user.findFirst({
        where: { id: forUser, organizationId: user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!member) throw new ApiError("That person isn't on this team", 404);
    } else {
      const refusal = canSelfCheckIn(forDate, new Date(), tz);
      if (refusal) throw new ApiError(refusal, 400);
    }

    // Once a day. The unique index is the real guarantee; this turns the
    // second press of the button into "you're already in" rather than a 500.
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: forUser, date: forDate } },
      select: { id: true, checkedInAt: true, source: true },
    });
    if (existing) {
      return NextResponse.json({
        already: true,
        id: existing.id,
        date: dayString(forDate),
        checkedInAt: existing.checkedInAt.toISOString(),
        source: existing.source,
      });
    }

    const row = await prisma.attendance.create({
      data: {
        organizationId: user.organizationId,
        userId: forUser,
        date: forDate,
        note,
        source: onBehalf ? "ADMIN" : "SELF",
        recordedById: onBehalf ? user.id : null,
      },
      select: { id: true, date: true, checkedInAt: true, source: true },
    });

    return NextResponse.json({
      already: false,
      id: row.id,
      date: dayString(row.date),
      checkedInAt: row.checkedInAt.toISOString(),
      source: row.source,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/hr/attendance");
  }
}

/**
 * DELETE /api/hr/attendance?id=… — undo a row recorded by mistake.
 *
 * hr.manage only, including for your own: attendance is a record other
 * people rely on, so removing a day is an administrative act rather than a
 * personal one.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "hr.manage");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("Which record?", 400);

    const row = await prisma.attendance.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!row) throw new ApiError("Not found", 404);

    await prisma.attendance.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/hr/attendance");
  }
}
