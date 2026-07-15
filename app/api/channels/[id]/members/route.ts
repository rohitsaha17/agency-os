import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertChannelInOrg(channelId: string, organizationId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, organizationId },
    select: { id: true },
  });
  if (!channel) throw new ApiError("Channel not found", 404);
}

// GET /api/channels/[id]/members
export async function GET(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const user = await requireAuth(req);
    await assertChannelInOrg(channelId, user.organizationId);

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
    return handleApiError(err, "GET /api/channels/[id]/members");
  }
}

// POST /api/channels/[id]/members  — add/bulk-add members
export async function POST(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const user = await requireAuth(req);
    await assertChannelInOrg(channelId, user.organizationId);

    const { userIds, role } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new ApiError("userIds required", 400);
    }

    // Confirm all added members belong to the same org.
    const orgMembers = await prisma.user.count({
      where: { id: { in: userIds }, organizationId: user.organizationId },
    });
    if (orgMembers !== userIds.length) {
      throw new ApiError("One or more users not found in your organization", 404);
    }

    // Upsert members (skip existing)
    await prisma.channelMember.createMany({
      data: (userIds as string[]).map((userId) => ({ channelId, userId, role: role ?? "MEMBER" })),
      skipDuplicates: true,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "POST /api/channels/[id]/members");
  }
}

// DELETE /api/channels/[id]/members?userId=...
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const user = await requireAuth(req);
    await assertChannelInOrg(channelId, user.organizationId);

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw new ApiError("userId required", 400);
    await prisma.channelMember.delete({ where: { channelId_userId: { channelId, userId } } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/channels/[id]/members");
  }
}
