import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/channels/seed — ensure default GENERAL channels exist
export async function POST() {
  try {
    const defaults = [
      { name: "general",       description: "Company-wide updates and announcements" },
      { name: "announcements", description: "Important announcements for the whole team" },
      { name: "random",        description: "Off-topic conversations and fun" },
    ];

    for (const ch of defaults) {
      await prisma.channel.upsert({
        where: { name_type: { name: ch.name, type: "GENERAL" } } as never,
        update: {},
        create: { name: ch.name, description: ch.description, type: "GENERAL" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/channels/seed]", err);
    return NextResponse.json({ error: "Failed to seed channels" }, { status: 500 });
  }
}
