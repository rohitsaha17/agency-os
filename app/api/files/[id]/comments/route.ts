import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertFileInOrg(fileId: string, organizationId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true },
  });
  if (!file) throw new ApiError("File not found", 404);
}

// ── GET /api/files/[id]/comments ──────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertFileInOrg(id, user.organizationId);

    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId") ?? undefined;

    const where: Record<string, unknown> = {
      fileId: id,
      parentId: null,
    };
    if (versionId) where.versionId = versionId;

    const comments = await prisma.fileComment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
        task: { select: { id: true, title: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true, role: true } },
          },
        },
      },
    });

    return NextResponse.json(comments);
  } catch (err) {
    return handleApiError(err, "GET /api/files/[id]/comments");
  }
}

// ── POST /api/files/[id]/comments ─────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertFileInOrg(id, user.organizationId);

    const body = await req.json();

    const {
      body: commentBody,
      authorName,
      posX,
      posY,
      timestamp,
      page,
      parentId,
      versionId,
    } = body as {
      body: string;
      authorName?: string;
      posX?: number | null;
      posY?: number | null;
      timestamp?: number | null;
      page?: number | null;
      parentId?: string | null;
      versionId?: string | null;
    };

    if (!commentBody?.trim()) {
      throw new ApiError("Comment body is required", 400);
    }

    // A reply's parent must be a comment on this same file.
    if (parentId) {
      const parent = await prisma.fileComment.findFirst({
        where: { id: parentId, fileId: id },
        select: { id: true },
      });
      if (!parent) throw new ApiError("Parent comment not found", 404);
    }

    const comment = await prisma.fileComment.create({
      data: {
        fileId: id,
        authorId: user.id,
        authorName: user.name || authorName || "Team Member",
        body: commentBody.trim(),
        posX: posX ?? null,
        posY: posY ?? null,
        timestamp: timestamp ?? null,
        page: page ?? null,
        parentId: parentId ?? null,
        versionId: versionId ?? null,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
        task: { select: { id: true, title: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true, role: true } },
          },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/files/[id]/comments");
  }
}
