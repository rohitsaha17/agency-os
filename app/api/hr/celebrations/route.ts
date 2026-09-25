import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { monthDay } from "@/lib/people";

/**
 * GET /api/hr/celebrations — the team's birthdays and work anniversaries.
 *
 * WHY THIS IS NOT BEHIND hr.records
 *
 * The staff directory is, and it holds dateOfBirth among the phone numbers and
 * next of kin. But a birthday calendar that only managers can see is not a
 * birthday calendar; the whole value of it is that colleagues know.
 *
 * The two are reconciled by noticing they are not the same fact. A birthday is
 * a DAY AND A MONTH. A date of birth is a day, a month and a YEAR, and the
 * year is somebody's age. So this endpoint computes the month-day on the
 * server and the birth year never leaves it — there is no field to strip
 * downstream, and no future refactor can leak one, because it was never
 * selected in a shape that contained it.
 *
 * Work anniversaries carry their year deliberately: "five years today" is the
 * occasion, not a disclosure, and a joining date is not private in the way an
 * age is.
 *
 * WHAT IS STILL WITHHELD
 *
 * Somebody with no date recorded simply is not in the list. An absence here
 * means nobody filled the field in — it is not a claim that they have no
 * birthday, and the UI says so rather than showing a row of dashes.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const people = await prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true, name: true, avatarUrl: true,
        jobTitle: { select: { name: true } },
        staffProfile: { select: { dateOfBirth: true, dateOfJoining: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      people: people
        .map((p) => ({
          id: p.id,
          name: p.name,
          avatarUrl: p.avatarUrl,
          craft: p.jobTitle?.name ?? null,
          /** "03-14". Never the year — see above. */
          birthday: monthDay(p.staffProfile?.dateOfBirth ?? null),
          /**
           * The full joining date, because years of service is the point of
           * the anniversary. The client derives the month-day from it.
           */
          joined: p.staffProfile?.dateOfJoining?.toISOString() ?? null,
        }))
        // Nothing recorded means nothing to celebrate yet, not a blank row.
        .filter((p) => p.birthday || p.joined),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/celebrations");
  }
}
