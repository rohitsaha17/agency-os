import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/files/[id] ────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
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
      throw new ApiError("File not found", 404);
    }

    return NextResponse.json(file);
  } catch (err) {
    return handleApiError(err, "GET /api/files/[id]");
  }
}

// ── PATCH /api/files/[id] ──────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("File not found", 404);

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
    return handleApiError(err, "PATCH /api/files/[id]");
  }
}

// ── DELETE /api/files/[id] ─────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("File not found", 404);

    await prisma.file.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/files/[id]");
  }
}
