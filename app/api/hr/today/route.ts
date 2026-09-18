import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";
import { dayKey, dayString, attendanceDay } from "@/lib/hr";

/**
 * GET /api/hr/today — who is in, who is out, and who hasn't said.
 *
 * The question this answers is the one somebody asks before handing out a
 * shoot: "who is actually here today". So it returns the whole team in one
 * request with a state each, rather than a list of check-ins that the client
 * would have to subtract from a list of people.
 *
 * Three states, and the third is not a failure:
 *   IN        checked in
 *   ON_LEAVE  approved leave covering today — the reason is not included,
 *             because "why is Priya off" is between Priya and whoever
 *             approved it, and the board only needs to know not to assign
 *             her a shoot
 *   UNKNOWN   hasn't checked in yet. Not "absent": it is half past nine and
 *             they may be on the train. Naming it UNKNOWN keeps the UI
 *             honest about what it actually knows.
 *
 * Everybody gets their own row without any capability — knowing whether you
 * have checked in yourself is not privileged. Seeing the rest of the team
 * takes hr.view.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    // "Today" is the org's 6am-to-6am working day, so somebody still working
    // at 1am is looked up against the day they checked in on.
    const tz = user.organization?.timezone ?? "UTC";
    const day = dayKey(sp.get("date") ?? attendanceDay(new Date(), tz));
    const seesTeam = can(user, "hr.view");

    const [people, present, onLeave] = await Promise.all([
      prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
          ...(seesTeam ? {} : { id: user.id }),
        },
        select: {
          id: true, name: true, avatarUrl: true,
          jobTitle: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.attendance.findMany({
        where: {
          organizationId: user.organizationId,
          date: day,
          ...(seesTeam ? {} : { userId: user.id }),
        },
        select: { userId: true, checkedInAt: true, source: true, note: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          organizationId: user.organizationId,
          status: "APPROVED",
          startDate: { lte: day },
          endDate: { gte: day },
          ...(seesTeam ? {} : { userId: user.id }),
        },
        select: { userId: true, kind: true },
      }),
    ]);

    const inByUser = new Map(present.map((p) => [p.userId, p]));
    const leaveByUser = new Map(onLeave.map((l) => [l.userId, l]));

    const rows = people.map((p) => {
      const checkedIn = inByUser.get(p.id);
      const leave = leaveByUser.get(p.id);
      return {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        craft: p.jobTitle?.name ?? null,
        state: checkedIn ? "IN" : leave ? "ON_LEAVE" : "UNKNOWN",
        checkedInAt: checkedIn?.checkedInAt.toISOString() ?? null,
        // Says so when an admin recorded it, rather than passing it off as
        // the person having checked themselves in.
        recordedByAdmin: checkedIn?.source === "ADMIN",
        note: checkedIn?.note ?? null,
        leaveKind: leave?.kind ?? null,
      };
    });

    const me = rows.find((r) => r.id === user.id) ?? null;
    // Whether THIS person is expected to check in at all. An owner or admin
    // reviews attendance rather than recording it.
    const exempt = can(user, "attendance.exempt");

    return NextResponse.json({
      date: dayString(day),
      seesTeam,
      me: me && { state: me.state, checkedInAt: me.checkedInAt },
      exempt,
      /** The gate on the dashboard turns on exactly when this is true. */
      mustCheckIn: !exempt && me?.state === "UNKNOWN",
      people: rows,
      summary: {
        in: rows.filter((r) => r.state === "IN").length,
        onLeave: rows.filter((r) => r.state === "ON_LEAVE").length,
        unknown: rows.filter((r) => r.state === "UNKNOWN").length,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/today");
  }
}
