import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// ── GET /api/folders ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;
    const scope = searchParams.get("scope") ?? undefined;
    const parentId = searchParams.get("parentId"); // null string means root

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
    };

    if (projectId) where.projectId = projectId;
    if (clientId) where.clientId = clientId;
    if (scope) where.scope = scope;

    // parentId=null (literal query param) → root folders only
    // parentId=<id> → children of that folder
    // parentId not provided → all folders
    if (parentId === "null") {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = parentId;
    }

    const folders = await prisma.folder.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        _count: { select: { children: true, files: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(folders);
  } catch (err) {
    return handleApiError(err, "GET /api/folders");
  }
}

// ── POST /api/folders ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { name, scope, parentId, projectId, clientId, description, color } =
      body as {
        name: string;
        scope?: string;
        parentId?: string;
        projectId?: string;
        clientId?: string;
        description?: string;
        color?: string;
      };

    if (!name || !name.trim()) {
      throw new ApiError("Folder name is required", 400);
    }

    // Verify any referenced parent/project/client belong to the caller's org.
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!parent) throw new ApiError("Parent folder not found", 404);
    }
    if (projectId) {
      const p = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!p) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!c) throw new ApiError("Client not found", 404);
    }

    const folder = await prisma.folder.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        scope: (scope as "PROJECT" | "CLIENT" | "COMMON") ?? "PROJECT",
        parentId: parentId || undefined,
        projectId: projectId || undefined,
        clientId: clientId || undefined,
        description: description?.trim() || null,
        color: color || null,
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        _count: { select: { children: true, files: true } },
      },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/folders");
  }
}
