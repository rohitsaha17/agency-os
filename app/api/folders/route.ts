import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── GET /api/folders ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;
    const scope = searchParams.get("scope") ?? undefined;
    const parentId = searchParams.get("parentId"); // null string means root

    const where: Record<string, unknown> = {};

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
    console.error("[GET /api/folders]", err);
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}

// ── POST /api/folders ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.create({
      data: {
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
    console.error("[POST /api/folders]", err);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
