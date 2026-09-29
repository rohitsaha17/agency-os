import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";

/**
 * Who may read/post in a chat channel (QA-012).
 *
 * Chat had no membership enforcement: any authenticated org member could read
 * and post in any channel — including per-client channels a junior should never
 * see. But membership is not populated for every channel (the company-wide
 * GENERAL channels — #general/#announcements/#random — are seeded with no
 * members on purpose), so a naive "must be a ChannelMember" rule would lock
 * everyone out of them. So access is:
 *
 *   - GENERAL channels: any org member (company-wide, by design), OR
 *   - an overseer — admin/owner, or anyone who runs the work (content.plan:
 *     manager/SMM) — since they already create and manage channels, OR
 *   - an explicit ChannelMember, OR
 *   - a member of the channel's project (project channels).
 *
 * This closes the junior-reads-client-channel leak without breaking the
 * company-wide channels or legitimate project/team chat. Tightening overseers
 * to own-projects only (QA-016) is a separate, later phase.
 */

function isOverseer(user: AuthUser): boolean {
  return user.role === "OWNER" || user.role === "ADMIN" || can(user, "content.plan");
}

/**
 * A Prisma `where` that matches only the channels this user may see. Use it in
 * list/search queries so inaccessible channels never appear. Overseers get the
 * whole org.
 */
export function accessibleChannelWhere(user: AuthUser) {
  if (isOverseer(user)) return { organizationId: user.organizationId };
  return {
    organizationId: user.organizationId,
    OR: [
      { type: "GENERAL" as const },
      { members: { some: { userId: user.id } } },
      { project: { members: { some: { userId: user.id } } } },
    ],
  };
}

/**
 * Assert the caller may act on one channel. Returns the channel core on
 * success. 404 when it isn't in the caller's org (don't confirm existence);
 * 403 when it's in the org but the caller isn't a member/overseer.
 */
export async function assertChannelAccess(
  channelId: string,
  user: AuthUser,
): Promise<{ id: string; type: string; projectId: string | null; organizationId: string }> {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, organizationId: user.organizationId },
    select: { id: true, type: true, projectId: true, organizationId: true },
  });
  if (!channel) throw new ApiError("Channel not found", 404);

  if (isOverseer(user) || channel.type === "GENERAL") return channel;

  const [asMember, asProjectMember] = await Promise.all([
    prisma.channelMember.findFirst({
      where: { channelId, userId: user.id }, select: { userId: true },
    }),
    channel.projectId
      ? prisma.projectMember.findFirst({
          where: { projectId: channel.projectId, userId: user.id }, select: { userId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!asMember && !asProjectMember) {
    throw new ApiError("You don't have access to this channel", 403);
  }
  return channel;
}
