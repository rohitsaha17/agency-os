import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

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
    console.error("[GET /api/channels/[id]/messages]", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/channels/[id]/messages  — supports multipart (with files) or JSON
export async function POST(req: NextRequest, { params }: Params) {
  const { id: channelId } = await params;
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let body = "";
    let authorName = "Team";
    let authorId: string | undefined;
    let taskId: string | undefined;
    const uploadedFileIds: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      body       = (fd.get("body") as string) ?? "";
      authorName = (fd.get("authorName") as string) || "Team";
      authorId   = (fd.get("authorId") as string)   || undefined;
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
      authorName = json.authorName || "Team";
      authorId   = json.authorId   || undefined;
      taskId     = json.taskId     || undefined;
    }

    if (!body?.trim() && uploadedFileIds.length === 0) {
      return NextResponse.json({ error: "Message body or attachment required" }, { status: 400 });
    }

    // Verify channel exists
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        body:       body.trim(),
        authorName: authorName.trim() || "Team",
        authorId:   authorId || null,
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
    console.error("[POST /api/channels/[id]/messages]", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
