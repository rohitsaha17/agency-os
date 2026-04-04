import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/channels/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const channel = await prisma.channel.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        client:  { select: { id: true, name: true, companyName: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { messages: true, members: true } },
      },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    return NextResponse.json({
      ...channel,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      members: channel.members.map((m) => ({
        ...m,
        lastReadAt: m.lastReadAt?.toISOString() ?? null,
        joinedAt: m.joinedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[GET /api/channels/[id]]", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/channels/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { name, description, isArchived } = await req.json();
    const channel = await prisma.channel.update({
      where: { id },
      data: {
        ...(name        !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isArchived  !== undefined && { isArchived }),
      },
    });
    return NextResponse.json({ ...channel, createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() });
  } catch (err) {
    console.error("[PATCH /api/channels/[id]]", err);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

// DELETE /api/channels/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.channel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/channels/[id]]", err);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
