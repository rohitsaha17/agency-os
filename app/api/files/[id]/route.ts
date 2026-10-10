import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { requireProjectCapability } from "@/lib/project-scope";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { deleteFile } from "@/lib/storage";

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
      select: { id: true, projectId: true },
    });
    if (!existing) throw new ApiError("File not found", 404);
    // QA-016 parity: an SMM holds content.plan org-wide, so without this they
    // could edit a file on a project they're not on. Scope it to their own
    // projects, exactly as content-items and tasks do.
    await requireProjectCapability(user, "content.plan", existing.projectId);

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
      // s3Key of the file itself + every version, so the objects go with the
      // row (QA-005). Collected BEFORE the delete, because FileVersion cascades.
      select: { id: true, projectId: true, s3Key: true, versions: { select: { s3Key: true } } },
    });
    if (!existing) throw new ApiError("File not found", 404);
    // QA-016 parity: an SMM may only delete files on projects they're on —
    // deleting removes the storage object permanently, so this matters more here
    // than on PATCH.
    await requireProjectCapability(user, "content.plan", existing.projectId);

    await prisma.file.delete({ where: { id } });

    // Remove the underlying storage objects too — deleting the row alone left
    // them in the bucket, publicly fetchable forever (QA-005). Best-effort:
    // deleteFile never throws, and an orphaned object must not fail the request.
    const keys = new Set<string>();
    if (existing.s3Key) keys.add(existing.s3Key);
    for (const v of existing.versions) if (v.s3Key) keys.add(v.s3Key);
    await Promise.all([...keys].map((k) => deleteFile(k)));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/files/[id]");
  }
}
