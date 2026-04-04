import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/channels/[id]/members
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return NextResponse.json(members.map((m) => ({
      ...m,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
    })));
  } catch (err) {
    console.error("[GET members]", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/channels/[id]/members  — add/bulk-add members
export async function POST(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const { userIds, role } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    // Upsert members (skip existing)
    await prisma.channelMember.createMany({
      data: (userIds as string[]).map((userId) => ({ channelId, userId, role: role ?? "MEMBER" })),
      skipDuplicates: true,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST members]", err);
    return NextResponse.json({ error: "Failed to add members" }, { status: 500 });
  }
}

// DELETE /api/channels/[id]/members?userId=...
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    await prisma.channelMember.delete({ where: { channelId_userId: { channelId, userId } } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE member]", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
