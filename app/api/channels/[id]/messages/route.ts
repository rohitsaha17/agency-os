import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
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

const MSG_INCLUDE = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  task:   { select: { id: true, title: true } },
  attachments: {
    include: {
      file: { select: { id: true, name: true, mimeType: true, mimeCategory: true, size: true, url: true, thumbnailUrl: true } },
    },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMsg(m: any) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    editedAt:  m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
  };
}

// GET /api/channels/[id]/messages?before=ISO&limit=50
export async function GET(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const user = await requireAuth(req);
    await assertChannelInOrg(channelId, user.organizationId);

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before");
    const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        parentId: null, // only top-level messages
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      include: MSG_INCLUDE,
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return NextResponse.json(messages.map(serializeMsg));
  } catch (err) {
    return handleApiError(err, "GET /api/channels/[id]/messages");
  }
}

// POST /api/channels/[id]/messages  — supports multipart (with files) or JSON
export async function POST(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const user = await requireAuth(req);
    await assertChannelInOrg(channelId, user.organizationId);

    const contentType = req.headers.get("content-type") ?? "";

    let body = "";
    let taskId: string | undefined;
    const uploadedFileIds: string[] = [];

    // The author is ALWAYS the authenticated caller — never taken from the
    // request, so messages can't be posted under someone else's name.
    const authorId = user.id;
    const authorName = user.name;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      body       = (fd.get("body") as string) ?? "";
      taskId     = (fd.get("taskId") as string)      || undefined;

      // Handle file attachments
      const files = fd.getAll("files") as File[];
      for (const file of files) {
        if (!(file instanceof Blob)) continue;
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        await mkdir(uploadsDir, { recursive: true });
        const bytes  = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ts     = Date.now();
        const safe   = (file as File).name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fname  = `${ts}_${safe}`;
        await writeFile(path.join(uploadsDir, fname), buffer);
        const s3Key = `uploads/${fname}`;
        const url   = `/uploads/${fname}`;

        // Detect mime category
        const mime = (file as File).type;
        const mimeCategory =
          mime.startsWith("image/") ? "image" :
          mime.startsWith("video/") ? "video" :
          mime === "application/pdf" ? "pdf" :
          "other";

        const created = await prisma.file.create({
          data: {
            organizationId: user.organizationId,
            name: (file as File).name,
            mimeType: mime,
            mimeCategory,
            size: (file as File).size,
            s3Key,
            url,
            status: "DRAFT",
          },
        });
        uploadedFileIds.push(created.id);
      }
    } else {
      const json = await req.json();
      body       = json.body       ?? "";
      taskId     = json.taskId     || undefined;
    }

    if (!body?.trim() && uploadedFileIds.length === 0) {
      throw new ApiError("Message body or attachment required", 400);
    }

    // If taskId given, verify it's in this org.
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!task) throw new ApiError("Task not found", 404);
    }

    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        body:       body.trim(),
        authorName: authorName?.trim() || "Team",
        authorId,
        taskId:     taskId   || null,
        ...(uploadedFileIds.length > 0 && {
          attachments: { create: uploadedFileIds.map((fileId) => ({ fileId })) },
        }),
      },
      include: MSG_INCLUDE,
    });

    // Touch channel updatedAt so it bubbles to top of list
    await prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });

    return NextResponse.json(serializeMsg(message), { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/channels/[id]/messages");
  }
}
