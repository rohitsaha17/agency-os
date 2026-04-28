import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/folders/[id] ─────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
        children: {
          include: {
            _count: { select: { children: true, files: true } },
          },
          orderBy: { name: "asc" },
        },
        files: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            mimeCategory: true,
            size: true,
            url: true,
            thumbnailUrl: true,
            status: true,
            createdAt: true,
            uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { children: true, files: true } },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(folder);
  } catch (err) {
    console.error("[GET /api/folders/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch folder" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/folders/[id] ───────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { name, description, color, parentId } = body as {
      name?: string;
      description?: string;
      color?: string | null;
      parentId?: string | null;
    };

    const folder = await prisma.folder.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId }),
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, files: true } },
      },
    });

    return NextResponse.json(folder);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2025") {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }
    console.error("[PATCH /api/folders/[id]]", err);
    return NextResponse.json(
      { error: "Failed to update folder" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/folders/[id] ──────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2025") {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }
    console.error("[DELETE /api/folders/[id]]", err);
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
