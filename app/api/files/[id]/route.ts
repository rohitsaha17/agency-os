import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/files/[id] ────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        fileTags: {
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
        versions: { orderBy: { version: "desc" } },
        comments: {
          where: { parentId: null },
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            task: { select: { id: true, title: true } },
            replies: {
              orderBy: { createdAt: "asc" },
              include: {
                author: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
        _count: { select: { comments: true, versions: true } },
      },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return NextResponse.json(file);
  } catch (err) {
    console.error("[GET /api/files/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}

// ── PATCH /api/files/[id] ──────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { name, description, status, isShared, clientId, projectId, taskId, tagIds } =
      body as {
        name?: string;
        description?: string;
        status?: string;
        isShared?: boolean;
        clientId?: string | null;
        projectId?: string | null;
        taskId?: string | null;
        tagIds?: string[];
      };

    // If tagIds are being updated, replace them entirely
    const tagUpdate =
      tagIds !== undefined
        ? {
            fileTags: {
              deleteMany: {},
              create: tagIds.map((tagId: string) => ({ tagId })),
            },
          }
        : {};

    const updated = await prisma.file.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status: status as never }),
        ...(isShared !== undefined && { isShared }),
        ...(clientId !== undefined && { clientId }),
        ...(projectId !== undefined && { projectId }),
        ...(taskId !== undefined && { taskId }),
        ...tagUpdate,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        fileTags: {
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
        _count: { select: { comments: true, versions: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/files/[id]]", err);
    return NextResponse.json({ error: "Failed to update file" }, { status: 500 });
  }
}

// ── DELETE /api/files/[id] ─────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.file.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/files/[id]]", err);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
