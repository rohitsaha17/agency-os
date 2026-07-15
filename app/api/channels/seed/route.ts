import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// POST /api/channels/seed — ensure default GENERAL channels exist for the caller's org
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const defaults = [
      { name: "general",       description: "Company-wide updates and announcements" },
      { name: "announcements", description: "Important announcements for the whole team" },
      { name: "random",        description: "Off-topic conversations and fun" },
    ];

    for (const ch of defaults) {
      // No composite unique index on (organizationId, name, type) — do a
      // findFirst + create dance so seeding is idempotent per-org.
      const existing = await prisma.channel.findFirst({
        where: { organizationId: user.organizationId, name: ch.name, type: "GENERAL" },
        select: { id: true },
      });
      if (!existing) {
        await prisma.channel.create({
          data: {
            organizationId: user.organizationId,
            name: ch.name,
            description: ch.description,
            type: "GENERAL",
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "POST /api/channels/seed");
  }
}
