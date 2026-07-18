import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

const CHANNEL_SELECT = {
  id: true, name: true, description: true, type: true,
  projectId: true, clientId: true, isArchived: true,
  createdAt: true, updatedAt: true,
  project: { select: { id: true, name: true } },
  client:  { select: { id: true, name: true, companyName: true } },
  members: { select: { userId: true, role: true, lastReadAt: true, user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
  _count:  { select: { messages: true, members: true } },
  messages: { select: { id: true, authorName: true, body: true, createdAt: true, authorId: true, taskId: true, attachments: { select: { id: true } } }, orderBy: { createdAt: "desc" as const }, take: 1 },
} as const;

function serialize(ch: Record<string, unknown>) {
  return {
    ...ch,
    createdAt: (ch.createdAt as Date).toISOString(),
    updatedAt: (ch.updatedAt as Date).toISOString(),
    lastMessage: Array.isArray(ch.messages) && ch.messages.length > 0
      ? { ...(ch.messages as Record<string, unknown>[])[0], createdAt: ((ch.messages as { createdAt: Date }[])[0].createdAt).toISOString() }
      : null,
    messages: undefined,
  };
}

// GET /api/channels  — list channels (optionally filter by projectId / clientId / type)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const clientId  = searchParams.get("clientId")  ?? undefined;
    const type      = searchParams.get("type")       ?? undefined;

    const channels = await prisma.channel.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
        ...(projectId && { projectId }),
        ...(clientId  && { clientId  }),
        ...(type      && { type: type as never }),
      },
      select: CHANNEL_SELECT,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(channels.map(serialize));
  } catch (err) {
    return handleApiError(err, "GET /api/channels");
  }
}

// POST /api/channels — create a channel
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { name, description, type, projectId, clientId, memberIds } = await req.json();
    if (!name?.trim()) throw new ApiError("Channel name is required", 400);

    // Verify any referenced project/client belong to the caller's org.
    if (projectId) {
      const p = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!p) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!c) throw new ApiError("Client not found", 404);
    }
    if (memberIds?.length) {
      const count = await prisma.user.count({
        where: { id: { in: memberIds as string[] }, organizationId: user.organizationId },
      });
      if (count !== new Set(memberIds as string[]).size) {
        throw new ApiError("One or more members not found", 404);
      }
    }

    const channel = await prisma.channel.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        type: type || "GENERAL",
        projectId: projectId || null,
        clientId:  clientId  || null,
        ...(memberIds?.length && {
          members: { create: (memberIds as string[]).map((userId, i) => ({ userId, role: i === 0 ? "ADMIN" : "MEMBER" })) },
        }),
      },
      select: CHANNEL_SELECT,
    });

    return NextResponse.json(serialize(channel as unknown as Record<string, unknown>), { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/channels");
  }
}
