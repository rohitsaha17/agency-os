/**
 * Whose birthday or work anniversary falls when.
 *
 * WHY THIS IS SEPARATE FROM lib/people.ts
 *
 * The helpers there (nextOccurrence, daysUntil) read the RUNTIME's local
 * date — `from.getFullYear()`, `getMonth()`, `getDate()`. In the browser that
 * is the viewer's own calendar, which is what the People tab wants. On Vercel
 * it is UTC, which is not what anybody wants: an Indian team's 28 September
 * begins at 18:30 on the 27th UTC, so a birthday notification sent from the
 * server would arrive on the wrong day, every time, for half the day.
 *
 * So the day is passed in here, resolved in the ORGANIZATION's timezone, and
 * nothing in this file asks the runtime what day it is.
 *
 * No `Date` arithmetic across timezones either: a calendar day is three
 * integers, compared as three integers. Adding 86,400,000 milliseconds is
 * wrong twice a year in places that observe daylight saving.
 */

/** A calendar day, with no time and no zone attached. */
export type Day = { y: number; m: number; d: number };

export type CelebrationKind = "BIRTHDAY" | "ANNIVERSARY";

export type CelebrationPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  craft?: string | null;
  /** "MM-DD". Never a year — see app/api/hr/celebrations/route.ts. */
  birthday?: string | null;
  /** Full ISO date. The year IS the occasion for an anniversary. */
  joined?: string | null;
};

export type Celebration = {
  personId: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
  kind: CelebrationKind;
  /** "MM-DD" */
  md: string;
  /** 0 is today. Never negative. */
  daysAway: number;
  /** Years of service. Null for birthdays, and for the joining year itself. */
  years: number | null;
  /** "YYYY-MM-DD", the day it actually lands on. */
  on: string;
};

/** Today in a given timezone, as three integers. */
export function localDay(now: Date, timeZone: string): Day {
  // en-CA gives YYYY-MM-DD, and Intl is the only thing that knows the offset
  // on this date in this zone — including whatever the rules were.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function dayToISO(day: Day): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Whole days between two calendar days. Sign follows b - a. */
export function daysBetween(a: Day, b: Day): number {
  const A = Date.UTC(a.y, a.m - 1, a.d);
  const B = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((B - A) / 86_400_000);
}

/**
 * The next time "MM-DD" comes round, today included.
 *
 * 29 February is the whole reason this is a function. Somebody born on a leap
 * day has no birthday in three years out of four, and Date(2027, 1, 29) rolls
 * silently into 1 March — moving their birthday onto a day that belongs to
 * someone else, in some years only, which is the kind of bug nobody reports
 * because it looks plausible. They are celebrated on the 28th in common
 * years, keeping the occasion inside the month they were born in.
 */
export function nextOccurrenceOn(md: string, today: Day): Day | null {
  if (!/^\d{2}-\d{2}$/.test(md)) return null;
  const [m, d] = md.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  for (const y of [today.y, today.y + 1]) {
    const day = m === 2 && d === 29 && !isLeapYear(y) ? 28 : d;
    const candidate = { y, m, d: day };
    if (daysBetween(today, candidate) >= 0) return candidate;
  }
  return null;
}

/** "MM-DD" from an ISO date, read as UTC so a stored date keeps its day. */
export function monthDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Every celebration falling within `windowDays` of `today`, soonest first.
 *
 * `windowDays` of 7 means today plus the next seven days — a week's notice,
 * which is enough to order a cake and not so much that the list stops being
 * news.
 */
export function celebrationsWithin(
  people: CelebrationPerson[],
  today: Day,
  windowDays = 7,
): Celebration[] {
  const out: Celebration[] = [];

  for (const p of people) {
    const add = (kind: CelebrationKind, md: string | null, joinedISO?: string | null) => {
      if (!md) return;
      const occ = nextOccurrenceOn(md, today);
      if (!occ) return;
      const daysAway = daysBetween(today, occ);
      if (daysAway > windowDays) return;

      // Years of service, and never "0 years" — that is the day somebody
      // started, not an anniversary, and listing it a week after they arrive
      // reads as a mistake.
      let years: number | null = null;
      if (kind === "ANNIVERSARY" && joinedISO) {
        const joined = new Date(joinedISO);
        if (!Number.isNaN(joined.getTime())) {
          const n = occ.y - joined.getUTCFullYear();
          years = n > 0 ? n : null;
        }
        if (years === null) return; // their first day is not an anniversary
      }

      out.push({
        personId: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl ?? null,
        craft: p.craft ?? null,
        kind, md, daysAway, years,
        on: dayToISO(occ),
      });
    };

    add("BIRTHDAY", p.birthday ?? null);
    add("ANNIVERSARY", monthDayOf(p.joined), p.joined);
  }

  return out.sort((a, b) =>
    a.daysAway - b.daysAway ||
    a.name.localeCompare(b.name) ||
    a.kind.localeCompare(b.kind));
}

/** "Today", "Tomorrow", "In 5 days". A countdown reads better than a date. */
export function countdown(daysAway: number): string {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

/** What the rest of the team is told. */
export function noticeForOthers(c: Celebration): string {
  return c.kind === "BIRTHDAY"
    ? `It's ${c.name}'s birthday today`
    : `${c.name} completes ${c.years} ${c.years === 1 ? "year" : "years"} today`;
}

/** What the person themselves is told. First name only — it is a greeting. */
export function noticeForSelf(c: Celebration): string {
  const first = c.name.trim().split(/\s+/)[0] || c.name;
  return c.kind === "BIRTHDAY"
    ? `Happy birthday, ${first}!`
    : `Happy work anniversary, ${first}!`;
}

/**
 * The key that stops a greeting being sent twice.
 *
 * Everybody's dashboard triggers the day's dispatch, so without this the
 * first five people to sign in would each send the whole team a birthday
 * notification. It is unique per occasion, per recipient, per day.
 */
export function celebrationDedupeKey(
  organizationId: string,
  on: string,
  kind: CelebrationKind,
  subjectId: string,
  recipientId: string,
): string {
  return `celeb:${organizationId}:${on}:${kind}:${subjectId}:${recipientId}`;
}
