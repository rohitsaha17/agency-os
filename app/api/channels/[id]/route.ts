import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// GET /api/channels/[id]
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: user.organizationId },
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
    if (!channel) throw new ApiError("Channel not found", 404);
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
    return handleApiError(err, "GET /api/channels/[id]");
  }
}

// PATCH /api/channels/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.channel.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Channel not found", 404);

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
    return handleApiError(err, "PATCH /api/channels/[id]");
  }
}

// DELETE /api/channels/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.channel.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Channel not found", 404);

    await prisma.channel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/channels/[id]");
  }
}
