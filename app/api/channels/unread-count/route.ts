import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/channels/unread-count
 *
 * Returns the total number of unread messages across all non-archived channels
 * in the caller's organization.
 * "Unread" = messages created after the most recent `lastReadAt` of any member,
 * falling back to counting ALL messages if no member has a `lastReadAt` set.
 *
 * This is a lightweight endpoint designed to be polled by the sidebar badge.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    // Only channels the CALLER is a member of, using the caller's own
    // lastReadAt — and never counting the caller's own messages.
    const memberships = await prisma.channelMember.findMany({
      where: {
        userId: user.id,
        channel: { organizationId: user.organizationId, isArchived: false },
      },
      select: { channelId: true, lastReadAt: true },
    });

    // PERF-004/QA-011: one count, not one per channel. The old loop issued a
    // `chatMessage.count` for every membership — an N+1 that grows with how many
    // channels the caller belongs to. Each channel carries its own `lastReadAt`
    // cutoff, so they can't share a single flat filter; instead each becomes one
    // branch of an OR (channelId + that channel's cutoff), and a single count
    // over the union returns the same total. `authorId != caller` stays an outer
    // AND so it applies to every branch. Memberships are unique per
    // (userId, channelId), so no message matches two branches — no double-count.
    const totalUnread = memberships.length === 0
      ? 0
      : await prisma.chatMessage.count({
          where: {
            NOT: { authorId: user.id },
            OR: memberships.map((m) => ({
              channelId: m.channelId,
              ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
            })),
          },
        });

    return NextResponse.json({ unreadCount: totalUnread });
  } catch (err) {
    console.error("[GET /api/channels/unread-count]", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
