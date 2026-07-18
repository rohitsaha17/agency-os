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

    let totalUnread = 0;
    for (const m of memberships) {
      totalUnread += await prisma.chatMessage.count({
        where: {
          channelId: m.channelId,
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          NOT: { authorId: user.id },
        },
      });
    }

    return NextResponse.json({ unreadCount: totalUnread });
  } catch (err) {
    console.error("[GET /api/channels/unread-count]", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
