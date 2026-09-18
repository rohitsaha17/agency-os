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
