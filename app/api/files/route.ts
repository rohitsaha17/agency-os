import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

// ── helpers ────────────────────────────────────────────────────

function getMimeCategory(
  mimeType: string
): "image" | "video" | "pdf" | "doc" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv"
  )
    return "doc";
  return "other";
}

const fileSelect = {
  id: true,
  name: true,
  mimeType: true,
  mimeCategory: true,
  size: true,
  s3Key: true,
  url: true,
  thumbnailUrl: true,
  description: true,
  status: true,
  isShared: true,
  clientId: true,
  projectId: true,
  taskId: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  fileTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true, versions: true } },
};

// ── GET /api/files ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const projectId = searchParams.get("projectId") ?? undefined;
    const taskId = searchParams.get("taskId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const tagId = searchParams.get("tagId") ?? undefined;

    const where: Record<string, unknown> = {};

    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;
    if (taskId) where.taskId = taskId;
    if (status) where.status = status;
    if (category) where.mimeCategory = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tagId) {
      where.fileTags = { some: { tagId } };
    }

    const files = await prisma.file.findMany({
      where,
      select: fileSelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(files);
  } catch (err) {
    console.error("[GET /api/files]", err);
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 });
  }
}

// ── POST /api/files ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFile = formData.get("file");

    if (!rawFile || !(rawFile instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const file = rawFile as File;
    const clientId = (formData.get("clientId") as string) || null;
    const projectId = (formData.get("projectId") as string) || null;
    const taskId = (formData.get("taskId") as string) || null;
    const description = (formData.get("description") as string) || null;
    const tagIdsRaw = formData.getAll("tagIds[]");
    const tagIds = tagIdsRaw.map((t) => t.toString()).filter(Boolean);

    // Persist to public/uploads/
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Unique filename to avoid collisions
    const timestamp = Date.now();
    const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${timestamp}_${safeOriginalName}`;
    const filePath = path.join(uploadsDir, filename);
    await writeFile(filePath, buffer);

    const s3Key = `uploads/${filename}`;
    const url = `/uploads/${filename}`;
    const mimeCategory = getMimeCategory(file.type);

    // Create DB record
    const created = await prisma.file.create({
      data: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        mimeCategory,
        size: file.size,
        s3Key,
        s3Bucket: "local",
        url,
        description,
        status: "DRAFT",
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        // Create v1 version inline
        versions: {
          create: {
            version: 1,
            s3Key,
            url,
            size: file.size,
          },
        },
        fileTags:
          tagIds.length > 0
            ? { create: tagIds.map((tagId) => ({ tagId })) }
            : undefined,
      },
      select: fileSelect,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/files]", err);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
