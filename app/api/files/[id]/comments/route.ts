import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/files/[id]/comments ──────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
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
        author: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { id: true, title: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    return NextResponse.json(comments);
  } catch (err) {
    console.error("[GET /api/files/[id]/comments]", err);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// ── POST /api/files/[id]/comments ─────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
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
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 }
      );
    }

    const comment = await prisma.fileComment.create({
      data: {
        fileId: id,
        authorName: authorName ?? "Anonymous",
        body: commentBody.trim(),
        posX: posX ?? null,
        posY: posY ?? null,
        timestamp: timestamp ?? null,
        page: page ?? null,
        parentId: parentId ?? null,
        versionId: versionId ?? null,
      },
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
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("[POST /api/files/[id]/comments]", err);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
