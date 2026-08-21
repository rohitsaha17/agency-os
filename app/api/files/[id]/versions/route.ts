import { NextRequest, NextResponse } from "next/server";
import { putFile, deleteFile } from "@/lib/storage";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertFileInOrg(fileId: string, organizationId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true },
  });
  if (!file) throw new ApiError("File not found", 404);
}

// ── GET /api/files/[id]/versions ───────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertFileInOrg(id, user.organizationId);

    const versions = await prisma.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });

    return NextResponse.json(versions);
  } catch (err) {
    return handleApiError(err, "GET /api/files/[id]/versions");
  }
}

// ── POST /api/files/[id]/versions ─────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    // Verify org ownership before creating a new version.
    const existingFile = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existingFile) throw new ApiError("File not found", 404);

    const formData = await req.formData();
    const rawFile = formData.get("file");

    if (!rawFile || !(rawFile instanceof Blob)) {
      throw new ApiError("No file provided", 400);
    }

    const file = rawFile as File;
    const notes = (formData.get("notes") as string) || null;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${timestamp}_${safeOriginalName}`;
    // See lib/storage — the filesystem is read-only on Vercel.
    const stored = await putFile(`uploads/${filename}`, buffer, file.type);

    const s3Key = stored.key;
    const url = stored.url;

    // Get the current highest version number
    const latestVersion = await prisma.fileVersion.findFirst({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Create new version record and update parent file in a transaction
    const [newVersion] = await prisma.$transaction([
      prisma.fileVersion.create({
        data: {
          fileId: id,
          version: nextVersion,
          s3Key,
          url,
          size: file.size,
          notes,
        },
      }),
      prisma.file.update({
        where: { id },
        data: {
          s3Key,
          url,
          size: file.size,
          status: "IN_REVIEW",
        },
      }),
    ]);

    return NextResponse.json(newVersion, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/files/[id]/versions");
  }
}

// ── DELETE /api/files/[id]/versions?versionId=xxx ─────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;
    await assertFileInOrg(id, user.organizationId);

    const versionId = new URL(req.url).searchParams.get("versionId");

    if (!versionId) {
      throw new ApiError("versionId query param required", 400);
    }

    // Ensure version exists and belongs to this file
    const version = await prisma.fileVersion.findFirst({
      where: { id: versionId, fileId: id },
    });
    if (!version) {
      throw new ApiError("Version not found", 404);
    }

    // Don't allow deleting the only remaining version
    const count = await prisma.fileVersion.count({ where: { fileId: id } });
    if (count <= 1) {
      throw new ApiError("Cannot delete the only version. Delete the file instead.", 400);
    }

    // Delete the version record
    await prisma.fileVersion.delete({ where: { id: versionId } });

    // Try to clean up the physical file
    if (version.url) {
      try {
        const filePath = path.join(process.cwd(), "public", version.url);
        await deleteFile(filePath);
      } catch { /* file may not exist on disk */ }
    }

    // If we deleted the latest version, update the parent file to point to the new latest
    const newLatest = await prisma.fileVersion.findFirst({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });
    if (newLatest) {
      await prisma.file.update({
        where: { id },
        data: { s3Key: newLatest.s3Key, url: newLatest.url, size: newLatest.size },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/files/[id]/versions");
  }
}
