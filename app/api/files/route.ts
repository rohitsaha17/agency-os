import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { assertUploadWithinQuota } from "@/lib/upload-limits";

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
  folderId: true,
  uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
  folder: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  fileTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true, versions: true } },
};

// ── GET /api/files ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const projectId = searchParams.get("projectId") ?? undefined;
    const taskId = searchParams.get("taskId") ?? undefined;
    const folderId = searchParams.get("folderId");
    const status = searchParams.get("status") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const tagId = searchParams.get("tagId") ?? undefined;
    const pagination = parsePagination(searchParams);

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
    };

    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;
    if (taskId) where.taskId = taskId;
    // folderId=null → files with no folder (root-level files)
    // folderId=<id> → files in that specific folder
    if (folderId === "null") {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }
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
    // unlinked=1 → files not attached to any client, project, or task
    if (searchParams.get("unlinked") === "1") {
      where.clientId = null;
      where.projectId = null;
      where.taskId = null;
    }

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        select: fileSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.paginated ? pagination.skip : undefined,
        take: pagination.paginated ? pagination.take : undefined,
      }),
      pagination.paginated ? prisma.file.count({ where }) : Promise.resolve(0),
    ]);

    if (pagination.paginated) {
      return NextResponse.json({
        data: files,
        pagination: paginationMeta(pagination, total),
      });
    }
    return NextResponse.json(files);
  } catch (err) {
    return handleApiError(err, "GET /api/files");
  }
}

// ── POST /api/files ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let writtenFilePath: string | null = null;
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `files:upload:${user.id}`, WRITE_RATE_LIMITS.heavy);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const formData = await req.formData();
    const rawFile = formData.get("file");

    if (!rawFile || !(rawFile instanceof Blob)) {
      throw new ApiError("No file provided", 400);
    }

    const file = rawFile as File;

    // Enforce the per-user upload storage quota (200 MB).
    await assertUploadWithinQuota(user.id, file.size);

    const clientId = (formData.get("clientId") as string) || null;
    const projectId = (formData.get("projectId") as string) || null;
    const taskId = (formData.get("taskId") as string) || null;
    const folderId = (formData.get("folderId") as string) || null;

    // Every record the upload is linked to must belong to the caller's org.
    const orgId = user.organizationId;
    if (clientId) {
      const ok = await prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Client not found", 404);
    }
    if (projectId) {
      const ok = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Project not found", 404);
    }
    if (taskId) {
      const ok = await prisma.task.findFirst({ where: { id: taskId, organizationId: orgId, deletedAt: null }, select: { id: true } });
      if (!ok) throw new ApiError("Task not found", 404);
    }
    if (folderId) {
      const ok = await prisma.folder.findFirst({ where: { id: folderId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Folder not found", 404);
    }
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
    writtenFilePath = filePath;

    const s3Key = `uploads/${filename}`;
    const url = `/uploads/${filename}`;
    const mimeCategory = getMimeCategory(file.type);

    // Create DB record — if this throws, the outer catch will clean up the
    // written file so we don't leave orphans on disk.
    const created = await prisma.file.create({
      data: {
        organizationId: user.organizationId,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        mimeCategory,
        size: file.size,
        s3Key,
        s3Bucket: "local",
        url,
        description,
        status: "DRAFT",
        uploadedById: user.id,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        folderId: folderId || undefined,
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
    // Disk write succeeded but DB insert failed → remove the orphan file.
    if (writtenFilePath) {
      try {
        await unlink(writtenFilePath);
      } catch {
        // File might already be gone or unwritable — swallow, we've logged below.
      }
    }
    return handleApiError(err, "POST /api/files");
  }
}
