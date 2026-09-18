/**
 * The rules behind the HR module, kept out of the route handlers so they can
 * be tested without a database.
 *
 * The one idea underneath all of it: this agency does not pay by the hour.
 * Nobody is being timed. So there is a check-in and no check-out, no hours
 * are derived from anything here, and "present" is a fact about a day rather
 * than a duration.
 */

export const MIN_LEAVE_REASON = 4;
export const MAX_LEAVE_REASON = 500;
/** How far back somebody may check themselves in. */
export const BACKDATE_DAYS = 0;

/**
 * Midnight UTC for a day, whatever spelling it arrives in.
 *
 * Every date in this module goes through here. The availability module
 * learned this the hard way: without one funnel, "2026-09-16" and
 * "2026-09-16T18:30:00Z" become two rows for the same Tuesday and the unique
 * index never fires.
 */
export function dayKey(value: string | Date): Date {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function dayString(value: string | Date): string {
  return dayKey(value).toISOString().slice(0, 10);
}

/** Every day from start to end, inclusive. Bounded so a typo can't span years. */
export function expandRange(start: string | Date, end: string | Date, maxDays = 90): Date[] {
  const a = dayKey(start);
  const b = dayKey(end);
  if (b < a) return [];
  const out: Date[] = [];
  for (let d = new Date(a); d <= b && out.length < maxDays; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

/** Whole days covered by a leave request, inclusive of both ends. */
export function leaveDays(start: string | Date, end: string | Date): number {
  const a = dayKey(start).getTime();
  const b = dayKey(end).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function validateLeaveReason(reason: string): string | null {
  const t = (reason ?? "").trim();
  if (t.length < MIN_LEAVE_REASON) return "Say a few words about why — the person approving it needs something to go on.";
  if (t.length > MAX_LEAVE_REASON) return `Keep it under ${MAX_LEAVE_REASON} characters.`;
  return null;
}

export function validateLeaveRange(start: string, end: string): string | null {
  if (!start || !end) return "Pick both dates.";
  const days = leaveDays(start, end);
  if (days === 0) return "The last day can't be before the first.";
  if (days > 90) return "That's more than 90 days — split it into separate requests.";
  return null;
}

/**
 * Can this person check in for this date?
 *
 * Only today, and only once. Backdating your own attendance is how a
 * presence record stops meaning anything; an admin can still record someone
 * who genuinely forgot, and that row is marked ADMIN so it reads as what it
 * is.
 */
export function canSelfCheckIn(date: string | Date, now: Date = new Date()): string | null {
  const day = dayString(date);
  const today = dayString(now);
  if (day > today) return "You can't check in for a day that hasn't happened yet.";
  if (day < today) return "That day has passed — ask an admin to add it.";
  return null;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

/** A decision only makes sense on something still waiting for one. */
export function canDecide(status: LeaveStatus): boolean {
  return status === "PENDING";
}

/**
 * Who may withdraw a request, and when.
 *
 * Yours, while nobody has acted on it — after a decision it is a record of
 * what was agreed, not a draft.
 *
 * An APPROVED one can still be revoked, but only by somebody who could have
 * approved it. Plans change, and without this the days it blocked out would
 * outlive the trip: the photographer's diary would show them off on the 20th
 * forever because the wedding moved.
 */
export function canCancel(
  status: LeaveStatus,
  isOwner: boolean,
  canDecideLeave = false,
): boolean {
  if (status === "PENDING") return isOwner || canDecideLeave;
  if (status === "APPROVED") return canDecideLeave;
  return false;
}

/** "2026-09" — the shape SalaryPayment.month is stored in. */
export function monthKey(value: string | Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return value;
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const m = Number(value.slice(5));
  return m >= 1 && m <= 12;
}

/** What is still owed on an advance or loan. Never stored — always derived. */
export function outstanding(amount: number, repaid: number): number {
  return Math.max(0, round2(amount - repaid));
}

/**
 * What this month's payslip comes to.
 *
 * Recovery is capped at what is actually outstanding AND at the gross, so a
 * large loan can't produce a negative payslip — somebody owing more than they
 * earn this month pays the rest back next month, they don't hand money back.
 */
export function payslip(gross: number, requestedDeduction: number, outstandingTotal: number) {
  const deduction = Math.max(0, Math.min(round2(requestedDeduction), outstandingTotal, gross));
  return { gross: round2(gross), deduction, net: round2(gross - deduction) };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * What an approved leave writes into the availability table.
 *
 * Approval is the moment leave becomes real. Before it, a request is a
 * question and the person is still available — nobody should be steered away
 * from assigning them work over a day off that might not be granted.
 *
 * The reason deliberately does NOT carry over. "Sister's wedding in Jaipur"
 * was written for the one person deciding it; the sentence an SMM sees when
 * an assignment is refused only needs to say why they can't have them. The
 * private reason stays on the leave request, where the approver reads it.
 */
export const LEAVE_BLOCK_REASON = "On approved leave";

/**
 * The days an approved leave covers, as rows ready for `unavailability`.
 *
 * `skipDuplicates` does the work on the overlap case: a photographer who
 * already blocked the 20th for a shoot keeps that row, and the 20th stays
 * blocked either way — which is the only thing the assignment guard cares
 * about. Trying to "win" that conflict would replace a specific reason with
 * a vaguer one for no gain.
 */
export function leaveBlockRows(args: {
  organizationId: string;
  userId: string;
  leaveRequestId: string;
  start: string | Date;
  end: string | Date;
  createdById?: string | null;
}) {
  return expandRange(args.start, args.end).map((date) => ({
    organizationId: args.organizationId,
    userId: args.userId,
    date,
    kind: "LEAVE" as const,
    reason: LEAVE_BLOCK_REASON,
    leaveRequestId: args.leaveRequestId,
    createdById: args.createdById ?? null,
  }));
}
