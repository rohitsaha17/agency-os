import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";
import { dayKey, blockedOn, blockedMessage } from "@/lib/availability";

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
