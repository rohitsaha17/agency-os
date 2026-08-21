import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/folders/[id] ─────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const folder = await prisma.folder.findFirst({
      where: { id, organizationId: user.organizationId },
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
      throw new ApiError("Folder not found", 404);
    }

    return NextResponse.json(folder);
  } catch (err) {
    return handleApiError(err, "GET /api/folders/[id]");
  }
}

// ── PATCH /api/folders/[id] ───────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;

    const existing = await prisma.folder.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Folder not found", 404);

    const body = await req.json();

    const { name, description, color, parentId } = body as {
      name?: string;
      description?: string;
      color?: string | null;
      parentId?: string | null;
    };

    // Verify moved parent is also in the caller's org (if reparenting),
    // and reject moves that would create a cycle (folder into itself or
    // one of its own descendants).
    if (parentId) {
      if (parentId === id) throw new ApiError("A folder cannot be moved into itself", 400);
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, organizationId: user.organizationId },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new ApiError("Parent folder not found", 404);

      let ancestor = parent.parentId;
      for (let depth = 0; ancestor && depth < 50; depth++) {
        if (ancestor === id) {
          throw new ApiError("A folder cannot be moved into its own subfolder", 400);
        }
        const next = await prisma.folder.findUnique({
          where: { id: ancestor },
          select: { parentId: true },
        });
        ancestor = next?.parentId ?? null;
      }
    }

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
  } catch (err) {
    return handleApiError(err, "PATCH /api/folders/[id]");
  }
}

// ── DELETE /api/folders/[id] ──────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;

    const existing = await prisma.folder.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Folder not found", 404);

    await prisma.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/folders/[id]");
  }
}
