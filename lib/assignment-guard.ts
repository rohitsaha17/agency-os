import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";
import { dayKey, blockedOn, blockedMessage } from "@/lib/availability";
import { canAssignToUser } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";

/**
 * One assignment guard for every task-creation door (QA-017).
 *
 * "Who may I hand work to" was enforced on POST /api/tasks but not on
 * POST /api/projects/[id]/tasks or the content-item assignment path, so the
 * same task could be assigned to someone the caller isn't allowed to assign to
 * simply by using a different door. This is that one check, so all three doors
 * apply the SAME policy — it is not a new policy.
 *
 * It validates, for each id the caller wants to put on a task (assignees, and
 * the manager/preferred-assignee where a door passes them):
 *   1. the target is a real user in the caller's organization (else 404), and
 *   2. the caller's role/Head-of-Design rules permit assigning to them (else
 *      403) — via the existing canAssignToUser matrix. Assigning to yourself is
 *      always allowed (that's how a junior writes their own to-do).
 *
 * Blocked-day/availability enforcement stays in assertAssignable, which each
 * door already calls (or now calls) against the resolved due date.
 */
export async function assertCanAssign(
  actor: AuthUser,
  targetIds: (string | null | undefined)[],
  organizationId: string,
): Promise<void> {
  const ids = [...new Set(targetIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return;

  const targets = await prisma.user.findMany({
    where: { id: { in: ids }, organizationId },
    // jobTitle so canAssignToUser can apply the Head-of-Design → designer rule.
    select: { id: true, name: true, role: true, jobTitle: { select: { slug: true, isDesign: true } } },
  });
  if (targets.length !== ids.length) {
    throw new ApiError("One or more users not found", 404);
  }

  const refused = targets.filter((t) => !canAssignToUser(actor, t));
  if (refused.length) {
    throw new ApiError(
      `You can't assign work to ${refused.map((t) => t.name).join(", ")}.`,
      403,
    );
  }
}

/**
 * Refuse an assignment that lands on a day somebody said they cannot work.
 *
 * The whole point of letting a freelance photographer mark Tuesday out is that
 * nobody can then book them on Tuesday. Enforced on the server, not by hiding
 * names in a picker: the picker is a convenience, this is the rule.
 *
 * A task with no due date is not blocked. "Do this at some point" does not
 * land on a day, and refusing it would mean an SMM could not hand over
 * undated work to anyone who has a holiday booked next month.
 *
 * Silent on the way through when there is nothing to check, so callers can
 * apply it unconditionally rather than deciding each time whether to.
 */
export async function assertAssignable(
  organizationId: string,
  userIds: string[],
  dueDate: Date | string | null | undefined,
): Promise<void> {
  if (!dueDate || userIds.length === 0) return;

  const day = dayKey(dueDate);
  const blocks = await prisma.unavailability.findMany({
    where: { organizationId, userId: { in: userIds }, date: day },
    select: {
      userId: true, date: true, kind: true, reason: true,
      user: { select: { id: true, name: true } },
    },
  });
  if (blocks.length === 0) return;

  const hits = blockedOn(blocks, userIds, day);
  if (hits.length === 0) return;

  // 409, not 400: the request is well formed, the world just says no.
  throw new ApiError(blockedMessage(hits, day), 409);
}
