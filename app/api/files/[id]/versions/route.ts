import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
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
