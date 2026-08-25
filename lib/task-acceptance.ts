/**
 * Accepting, or declining, work you have been handed.
 *
 * Assigning a task used to be a statement rather than a question: the work
 * appeared on someone's list and the assigner assumed it was moving. People
 * are on leave, double-booked, or simply not the right person for a job, and
 * none of that surfaced until a deadline passed.
 *
 * So an assignment now starts PENDING and the assignee answers it. Declining
 * needs a reason, because "not available" on its own tells the assigner
 * nothing they can act on — the whole point is that they can now decide
 * whether to move the work or move the date.
 *
 * The rules live here, apart from the route, so they can be tested directly
 * and so the UI and the API cannot disagree about who may do what.
 */

export type Acceptance = "PENDING" | "ACCEPTED" | "DECLINED";

/** The shortest reason that could actually be useful to the assigner. */
export const MIN_DECLINE_REASON = 3;
export const MAX_DECLINE_REASON = 500;

export interface AssignmentLike {
  userId: string;
  acceptance: Acceptance;
  assignedById?: string | null;
}

/**
 * Only the person holding the assignment answers it.
 *
 * Deliberately not extended to admins. A manager marking somebody else
 * "not available" is the manager's opinion recorded as that person's word,
 * and the reason attached to it would be theirs too. An admin who wants the
 * work elsewhere reassigns it — that action exists and says what it is.
 */
export function canRespond(
  assignment: AssignmentLike | undefined,
  userId: string,
): boolean {
  if (!assignment) return false;
  return assignment.userId === userId;
}

/**
 * Is this response a legal move from where the assignment currently is?
 *
 * Accepting twice is harmless and treated as settled rather than an error.
 * Answering something already answered is not: it would silently overwrite a
 * decline reason the assigner may already have acted on.
 */
export function canTransition(from: Acceptance, to: "ACCEPTED" | "DECLINED"): boolean {
  if (from === "PENDING") return true;
  // Re-accepting your own accepted task is a no-op, not a mistake.
  return from === "ACCEPTED" && to === "ACCEPTED";
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; error: string };

/** A decline reason the assigner can do something with. */
export function validateDeclineReason(raw: unknown): ReasonCheck {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < MIN_DECLINE_REASON) {
    return { ok: false, error: "Please say why you can't take this on — the assigner needs something to act on" };
  }
  if (reason.length > MAX_DECLINE_REASON) {
    return { ok: false, error: `Keep the reason under ${MAX_DECLINE_REASON} characters` };
  }
  return { ok: true, reason };
}

/**
 * Who hears about a decline.
 *
 * The person who made the assignment first — it is their plan that just
 * changed. The task's manager as well when that is somebody else, because on
 * an old assignment `assignedById` is null and somebody still has to know.
 * Never the person declining: they know.
 */
export function declineAudience(args: {
  assignedById?: string | null;
  managerId?: string | null;
  approverId?: string | null;
  decliningUserId: string;
}): string[] {
  const ids = [args.assignedById, args.managerId, args.approverId]
    .filter((id): id is string => !!id && id !== args.decliningUserId);
  return [...new Set(ids)];
}

/**
 * Work that is waiting on an answer, from the assigner's side.
 *
 * Used for the nudge on the tasks page: an assignment nobody has accepted is
 * not in progress, however confident the board looks.
 */
export function isAwaitingAcceptance(a: AssignmentLike): boolean {
  return a.acceptance === "PENDING";
}

/**
 * The row to write when work is handed to somebody.
 *
 * One helper because there are five places that create assignments — task
 * create, project task create, the approve/reassign path, and two system-task
 * generators — and an assignment written without an acceptance state is one
 * that silently defaults to PENDING with no record of who to tell when it is
 * declined.
 *
 * Assigning to yourself skips the question. Being asked to accept a task you
 * just created for yourself is noise, and it would put a banner on top of
 * every to-do anybody adds to their own list.
 */
export function newAssignment(userId: string, assignedById: string | null | undefined) {
  const self = !!assignedById && userId === assignedById;
  return {
    userId,
    assignedById: assignedById ?? null,
    acceptance: (self ? "ACCEPTED" : "PENDING") as Acceptance,
    respondedAt: self ? new Date() : null,
  };
}
