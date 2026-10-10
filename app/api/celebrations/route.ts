import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { sendPushToUser } from "@/lib/push";
import {
  localDay, dayToISO, celebrationsWithin, monthDayOf,
  noticeForOthers, noticeForSelf, celebrationDedupeKey,
  type Celebration, type CelebrationPerson,
} from "@/lib/celebrations";

/** Today plus the next seven days. Enough notice to order a cake. */
const WINDOW_DAYS = 7;

/**
 * GET /api/celebrations — who the team is celebrating, and this week's list.
 *
 * NOT BEHIND hr.records, FOR THE SAME REASON THE CELEBRATIONS TAB IS NOT
 *
 * The staff directory is gated: it holds dates of birth among next-of-kin and
 * phone numbers. A birthday people cannot see is not a birthday, though — the
 * whole value is that colleagues know. The two reconcile because they are not
 * the same fact: a birthday is a day and a month; a date of birth carries a
 * YEAR, and the year is somebody's age. The month-day is computed here and
 * the birth year is never selected in a shape that could leave.
 *
 * Joining years DO travel, because "five years today" is the occasion rather
 * than a disclosure.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const timeZone = user.organization?.timezone || "UTC";
    const today = localDay(new Date(), timeZone);

    const rows = await prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true, name: true, avatarUrl: true,
        jobTitle: { select: { name: true } },
        staffProfile: { select: { dateOfBirth: true, dateOfJoining: true } },
      },
    });

    const people: CelebrationPerson[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      craft: p.jobTitle?.name ?? null,
      birthday: monthDayOf(p.staffProfile?.dateOfBirth?.toISOString() ?? null),
      joined: p.staffProfile?.dateOfJoining?.toISOString() ?? null,
    }));

    const all = celebrationsWithin(people, today, WINDOW_DAYS);
    const todays = all.filter((c) => c.daysAway === 0);

    // Never fatal: the card is the point, and a workspace whose notifications
    // column has not been migrated yet should still see whose birthday it is
    // rather than an error where the card was.
    if (todays.length) {
      try {
        await dispatchTodaysNotices(
          user.organizationId,
          dayToISO(today),
          todays,
          rows.map((r) => r.id),
        );
      } catch {
        /* the greeting can wait; the page cannot */
      }
    }

    return NextResponse.json({
      today: todays,
      upcoming: all.filter((c) => c.daysAway > 0),
      /** So the card can greet you instead of telling you about yourself. */
      meId: user.id,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/celebrations");
  }
}

/**
 * Tell everyone, once.
 *
 * There is no scheduler in this app, so the day's greetings are sent by
 * whoever opens their dashboard first that morning. That makes every sign-in
 * a potential sender, which is exactly why each row carries a dedupe key:
 * skipDuplicates against a unique index means the second, third and tenth
 * caller write nothing — including when two arrive in the same instant.
 *
 * The person celebrating is greeted; everybody else is told about them. Same
 * occasion, different words, so nobody is informed of their own birthday in
 * the third person.
 */
async function dispatchTodaysNotices(
  organizationId: string,
  on: string,
  todays: Celebration[],
  everyoneIds: string[],
): Promise<void> {
  const data = todays.flatMap((c) =>
    everyoneIds.map((recipientId) => {
      const isSubject = recipientId === c.personId;
      return {
        organizationId,
        userId: recipientId,
        type: "CELEBRATION",
        title: isSubject ? noticeForSelf(c) : noticeForOthers(c),
        body: isSubject ? null : c.craft,
        link: "/hr?tab=celebrations",
        dedupeKey: celebrationDedupeKey(organizationId, on, c.kind, c.personId, recipientId),
      };
    }),
  );

  if (!data.length) return;

  // Which greetings don't exist yet — so the push goes out once, with the
  // in-app row, and a second dashboard-open the same morning pushes nothing.
  // (createMany's skipDuplicates handles the rows; this handles the push, which
  // createMany can't tell us about since it returns only a count.)
  const existing = await prisma.notification.findMany({
    where: { dedupeKey: { in: data.map((d) => d.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const already = new Set(existing.map((e) => e.dedupeKey));
  const fresh = data.filter((d) => !already.has(d.dedupeKey));

  await prisma.notification.createMany({ data, skipDuplicates: true });

  // Birthdays and work anniversaries reach the phone too, like every other
  // notification. Fire-and-forget: a failed push never blocks the greeting.
  for (const n of fresh) {
    void sendPushToUser(n.userId, { title: n.title, body: n.body, link: n.link });
  }
}
