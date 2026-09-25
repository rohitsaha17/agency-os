/**
 * How the People module says things.
 *
 * Formatting and the small pieces of derived meaning, in one place, because
 * six screens that each decide for themselves what a rupee looks like or what
 * an empty attendance cell means is how a module stops feeling like one
 * product. Pure functions, so `npx tsx scripts/check-hr.ts` can hold them to
 * account without a database.
 *
 * The rules in lib/hr.ts are the domain — what a payslip comes to, which day
 * an instant belongs to. This is the presentation layer's vocabulary. Nothing
 * here is allowed to invent a fact: where the data does not know something,
 * these return a dash rather than a guess.
 */

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * ₹6,80,000 — not ₹680,000.
 *
 * The app's shared formatMoney is locked to en-US, and this agency reads in
 * lakhs. Changing the shared one would re-group every invoice in the product
 * for a currency some other tenant may not use, so the Indian grouping lives
 * here and turns on for the currency it belongs to.
 */
export function money(
  amount: number | null | undefined,
  currency = "INR",
  opts: { decimals?: boolean } = {},
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount);
}

/** The same grouping without the symbol, for a column that has one in its head. */
export function amount(n: number | null | undefined, currency = "INR"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

/* ------------------------------------------------------------------ *
 * Dates
 *
 * All of these read a YYYY-MM-DD day key or an ISO instant as a UTC calendar
 * date. Every date in this module is stored as midnight UTC (lib/hr dayKey),
 * so reading it in local time would move an Indian team's 1st into the 31st.
 * ------------------------------------------------------------------ */

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
}

/*
  Month and weekday names come from these arrays rather than from
  toLocaleDateString.

  Intl is the right tool for a number; it is the wrong one for a label that
  has to stay put. Newer ICU builds render September as "Sept" under en-GB,
  so the same code produced "18 Sep 2026" on one Node version and "18 Sept
  2026" on the next — a column width that changes when a dependency does.
  These are the forms the brief asked for, and they do not move.
*/
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "18 Sep 2026" */
export function longDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "18 Sep" — for when the year is already established by the page. */
export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "Friday, 18 September" */
export function fullDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** "9:02 AM", from an instant. Local time: a check-in is a moment, not a day. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * "20 Sep → 22 Sep", or "20 Sep" for one day.
 *
 * The year appears only when the range is not in the current one — repeating
 * "2026" on every row of a September 2026 page is noise that pushes the
 * reason column off the screen.
 */
export function dateRange(
  start: string | Date,
  end: string | Date,
  today: Date = new Date(),
): string {
  const a = asDate(start);
  const b = asDate(end);
  const sameYear = a.getUTCFullYear() === today.getUTCFullYear()
    && b.getUTCFullYear() === today.getUTCFullYear();
  const fmt = sameYear ? shortDate : longDate;
  return a.getTime() === b.getTime() ? fmt(a) : `${fmt(a)} → ${fmt(b)}`;
}

/** "September 2026", from a "2026-09" month key. */
export function monthName(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_LONG[m - 1] ?? monthKey} ${y}`;
}

/** Step a "2026-09" month key. */
export function shiftMonth(monthKey: string, by: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every day in a month, as day keys with their weekday. */
export function monthDays(monthKey: string): { key: string; dom: number; dow: number }[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return [];
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: { key: string; dom: number; dow: number }[] = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    out.push({ key: date.toISOString().slice(0, 10), dom: d, dow: date.getUTCDay() });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Attendance, as a cell
 * ------------------------------------------------------------------ */

/**
 * What one person's one day looks like.
 *
 * There is deliberately no LATE. Nothing in this product stores an expected
 * start time — there is a check-in and no shift — so "late" would be a
 * judgement the software invented and then presented as a fact about
 * somebody's timekeeping. If working hours are ever recorded, this is where
 * the state belongs.
 *
 * FUTURE is separate from NO_RECORD for the same reason: a day that has not
 * happened is not an absence, and drawing it as one would put a red mark
 * against everybody for the rest of the month.
 */
export type AttendanceState = "PRESENT" | "LEAVE" | "NO_RECORD" | "FUTURE";

export const ATTENDANCE_LABEL: Record<AttendanceState, string> = {
  PRESENT: "Present",
  LEAVE: "On leave",
  NO_RECORD: "No record",
  FUTURE: "Not yet",
};

export interface AttendanceDay {
  date: string;
  checkedInAt: string;
  source?: "SELF" | "ADMIN";
}
export interface LeaveSpan {
  start: string;
  end: string;
  kind?: "PAID" | "UNPAID" | null;
}

export function attendanceState(
  day: AttendanceDay | undefined,
  leave: LeaveSpan | undefined,
  dateKey: string,
  today: string,
): AttendanceState {
  if (day) return "PRESENT";
  if (leave) return "LEAVE";
  return dateKey > today ? "FUTURE" : "NO_RECORD";
}

/** The leave span covering a day, if any. */
export function leaveOn(spans: LeaveSpan[], dateKey: string): LeaveSpan | undefined {
  return spans.find((l) => dateKey >= l.start && dateKey <= l.end);
}

/**
 * How much of the month somebody was in.
 *
 * The denominator is days that have HAPPENED, not the calendar month — on the
 * 18th, dividing by 30 tells everybody they are at 60% through no fault of
 * their own. Days on approved leave come out of the denominator too: leave
 * that was granted is not a failure to attend, and counting it as one turns
 * an approval into a mark against the person who received it.
 *
 * Returns null rather than 0 when there is nothing to divide by, so the UI
 * can say "—" instead of claiming a rate of zero.
 */
export function attendanceRate(counts: {
  present: number; leave: number; noRecord: number;
}): number | null {
  const expected = counts.present + counts.noRecord;
  if (expected <= 0) return null;
  return Math.round((counts.present / expected) * 100);
}

/* ------------------------------------------------------------------ *
 * Advances
 * ------------------------------------------------------------------ */

/**
 * How many months a balance takes to clear at a given monthly recovery.
 *
 * Null whenever the answer would be made up — no recovery set, a zero or
 * negative one, or nothing outstanding. The modal shows the estimate only
 * when there is a real one, which is what the brief asked for and also the
 * only honest version.
 */
export function recoveryMonths(
  outstandingAmount: number,
  perMonth: number | null | undefined,
): number | null {
  if (!perMonth || !Number.isFinite(perMonth) || perMonth <= 0) return null;
  if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) return null;
  return Math.ceil(outstandingAmount / perMonth);
}

export type AdvanceState = "SETTLED" | "ACTIVE";

/**
 * Settled, or still running.
 *
 * There is no OVERDUE. Overdue needs a date something was due by, and nothing
 * here records one — an advance is recovered from payroll whenever payroll
 * next runs. Calling a balance overdue because it is old would put a red
 * badge against a person for a deadline nobody ever set.
 */
export function advanceState(closedAt: string | null): AdvanceState {
  return closedAt ? "SETTLED" : "ACTIVE";
}

/* ------------------------------------------------------------------ *
 * Small shared words
 * ------------------------------------------------------------------ */

export const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

/** Title-cases an enum for display without inventing a label for it. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Matches a person against a search box: name, role, email, phone. */
export function matchesQuery(
  person: { name?: string | null; craft?: string | null; email?: string | null; phone?: string | null; role?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [person.name, person.craft, person.email, person.phone, person.role]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

/* ------------------------------------------------------------------ *
 * Birthdays and work anniversaries
 *
 * A date that comes round every year is not the same kind of thing as a
 * date. What the team wants is "the 14th of March, every year"; what the
 * record holds is "14 March 1991", and the difference between those two is
 * somebody's age.
 *
 * So everything here works on a MONTH-DAY — "03-14" — and the birth year
 * never leaves the server. Years of service are different and are carried in
 * full, because "five years today" IS the occasion.
 * ------------------------------------------------------------------ */

/** "03-14" from a stored date, read as UTC like every other day key here. */
export function monthDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * The next date a "MM-DD" falls on, today included.
 *
 * 29 FEBRUARY IS THE WHOLE REASON THIS IS A FUNCTION.
 *
 * Somebody born on a leap day has no birthday in three years out of four, and
 * `new Date(2027, 1, 29)` silently rolls into 1 March — so the naive version
 * moves their birthday to a day that belongs to somebody else, and only in
 * some years, which is the kind of bug nobody reports because it looks
 * plausible. They are celebrated on the 28th in common years: it keeps the
 * occasion inside February, where they were born.
 */
export function nextOccurrence(md: string, from: Date = new Date()): Date | null {
  if (!/^\d{2}-\d{2}$/.test(md)) return null;
  const [m, d] = md.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Compare on the viewer's own calendar day, so "today" means today here.
  const todayKey = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());

  for (const year of [from.getFullYear(), from.getFullYear() + 1]) {
    const day = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
    const candidate = Date.UTC(year, m - 1, day);
    if (candidate >= todayKey) return new Date(candidate);
  }
  return null;
}

/** Whole days from today until `date`. 0 means today. */
export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/** "Today", "Tomorrow", "In 9 days" — a countdown reads better than a date. */
export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * How many years of service this anniversary marks.
 *
 * Returns null for the joining year itself — "0 years" is not an anniversary,
 * it is the day somebody started, and putting it on a celebration list a week
 * after they arrive reads as a mistake.
 */
export function serviceYears(joinedISO: string, occurrence: Date): number | null {
  const joined = asDate(joinedISO);
  if (Number.isNaN(joined.getTime())) return null;
  const years = occurrence.getUTCFullYear() - joined.getUTCFullYear();
  return years > 0 ? years : null;
}

/** "14 Mar" — a recurring date has no year to show. */
export function monthDayLabel(md: string): string {
  if (!/^\d{2}-\d{2}$/.test(md)) return "—";
  const [m, d] = md.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1] ?? ""}`.trim();
}
