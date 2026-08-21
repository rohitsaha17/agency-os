import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
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
    requireCapability(user, "content.plan");
    const { id } = await params;

    const existing = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("File not found", 404);

    const body = await req.json();

    const { name, description, status, isShared, clientId, projectId, taskId, folderId, tagIds } =
      body as {
        name?: string;
        description?: string;
        status?: string;
        isShared?: boolean;
        clientId?: string | null;
        projectId?: string | null;
        taskId?: string | null;
        folderId?: string | null;
        tagIds?: string[];
      };

    // Any record the file is being linked to must belong to the caller's org.
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
        ...(folderId !== undefined && { folderId }),
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
    requireCapability(user, "content.plan");
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
