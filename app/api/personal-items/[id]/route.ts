import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/personal-items/[id] — toggle done / edit (own items only)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { done, title, note, date, time, listId, starred } = await req.json();

    const existing = await prisma.personalItem.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Item not found", 404);

    if (listId) {
      const list = await prisma.taskList.findFirst({
        where: { id: listId, userId: user.id },
        select: { id: true },
      });
      if (!list) throw new ApiError("List not found", 404);
    }

    const updated = await prisma.personalItem.update({
      where: { id },
      data: {
        ...(done !== undefined && { done: !!done, doneAt: done ? new Date() : null }),
        ...(title !== undefined && { title: title.trim() }),
        ...(note !== undefined && { note: note?.trim() || null }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(time !== undefined && { time: time?.trim() || null }),
        ...(listId !== undefined && { listId: listId || null }),
        ...(starred !== undefined && { starred: !!starred }),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/personal-items/[id]");
  }
}

// DELETE /api/personal-items/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const existing = await prisma.personalItem.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Item not found", 404);
    await prisma.personalItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/personal-items/[id]");
  }
}
