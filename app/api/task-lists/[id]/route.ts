import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/task-lists/[id] — rename
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { name } = await req.json();
    if (!name?.trim()) throw new ApiError("List name is required", 400);
    const existing = await prisma.taskList.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw new ApiError("List not found", 404);
    const updated = await prisma.taskList.update({ where: { id }, data: { name: name.trim() } });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/task-lists/[id]");
  }
}

// DELETE /api/task-lists/[id] — its items move to the default My Tasks column
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const existing = await prisma.taskList.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw new ApiError("List not found", 404);
    await prisma.taskList.delete({ where: { id } }); // items get listId = null via SetNull
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/task-lists/[id]");
  }
}
