import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/files/[id]/versions ───────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const versions = await prisma.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });

    return NextResponse.json(versions);
  } catch (err) {
    console.error("[GET /api/files/[id]/versions]", err);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}

// ── POST /api/files/[id]/versions ─────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Verify file exists
    const existingFile = await prisma.file.findUnique({ where: { id } });
    if (!existingFile) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const rawFile = formData.get("file");

    if (!rawFile || !(rawFile instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const file = rawFile as File;
    const notes = (formData.get("notes") as string) || null;

    // Persist to public/uploads/
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${timestamp}_${safeOriginalName}`;
    const filePath = path.join(uploadsDir, filename);
    await writeFile(filePath, buffer);

    const s3Key = `uploads/${filename}`;
    const url = `/uploads/${filename}`;

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
    console.error("[POST /api/files/[id]/versions]", err);
    return NextResponse.json(
      { error: "Failed to create version" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/files/[id]/versions?versionId=xxx ─────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const versionId = new URL(req.url).searchParams.get("versionId");

    if (!versionId) {
      return NextResponse.json({ error: "versionId query param required" }, { status: 400 });
    }

    // Ensure version exists and belongs to this file
    const version = await prisma.fileVersion.findFirst({
      where: { id: versionId, fileId: id },
    });
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Don't allow deleting the only remaining version
    const count = await prisma.fileVersion.count({ where: { fileId: id } });
    if (count <= 1) {
      return NextResponse.json({ error: "Cannot delete the only version. Delete the file instead." }, { status: 400 });
    }

    // Delete the version record
    await prisma.fileVersion.delete({ where: { id: versionId } });

    // Try to clean up the physical file
    if (version.url) {
      try {
        const filePath = path.join(process.cwd(), "public", version.url);
        await unlink(filePath);
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
    console.error("[DELETE /api/files/[id]/versions]", err);
    return NextResponse.json({ error: "Failed to delete version" }, { status: 500 });
  }
}
