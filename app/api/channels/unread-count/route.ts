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
    // Fetch all non-archived channels with their members' lastReadAt and message counts
    const channels = await prisma.channel.findMany({
      where: { organizationId: user.organizationId, isArchived: false },
      select: {
        id: true,
        members: {
          select: { lastReadAt: true },
        },
        _count: { select: { messages: true } },
      },
    });

    let totalUnread = 0;

    for (const ch of channels) {
      // Find the most recent lastReadAt across all members of this channel
      const lastRead = ch.members.reduce<Date | null>((latest, m) => {
        if (!m.lastReadAt) return latest;
        if (!latest) return m.lastReadAt;
        return m.lastReadAt > latest ? m.lastReadAt : latest;
      }, null);

      if (!lastRead) {
        // Nobody has read this channel yet — all messages are "unread"
        totalUnread += ch._count.messages;
      } else {
        // Count messages created after the latest read timestamp
        const unread = await prisma.chatMessage.count({
          where: {
            channelId: ch.id,
            createdAt: { gt: lastRead },
          },
        });
        totalUnread += unread;
      }
    }

    return NextResponse.json({ unreadCount: totalUnread });
  } catch (err) {
    console.error("[GET /api/channels/unread-count]", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
