import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// GET /api/task-lists — the caller's board lists
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const lists = await prisma.taskList.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(lists);
  } catch (error) {
    return handleApiError(error, "GET /api/task-lists");
  }
}

// POST /api/task-lists — { name }
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { name } = await req.json();
    if (!name?.trim()) throw new ApiError("List name is required", 400);
    const last = await prisma.taskList.findFirst({
      where: { userId: user.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const list = await prisma.taskList.create({
      data: { userId: user.id, name: name.trim(), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/task-lists");
  }
}
