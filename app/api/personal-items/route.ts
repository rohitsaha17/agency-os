import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notify } from "@/lib/notify";

// GET /api/personal-items — all of MY items (board view; includes done)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const items = await prisma.personalItem.findMany({
      where: { userId: user.id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ done: "asc" }, { date: "asc" }],
      take: 500,
    });
    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, "GET /api/personal-items");
  }
}

// POST /api/personal-items — { title, date?, time?, note?, userId?, listId?, starred? }
// userId (≠ self) = "add for teammate": ADMIN/MANAGER/OWNER or HEAD_OF_DESIGN
// only; the teammate is notified. date defaults to today (board quick-add).
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { title, date: rawDate, time, note, userId, listId, starred } = await req.json();
    if (!title?.trim()) throw new ApiError("Title is required", 400);
    const date = rawDate ?? new Date().toISOString().slice(0, 10);
    if (isNaN(new Date(date).getTime())) throw new ApiError("A valid date is required", 400);

    if (listId) {
      const list = await prisma.taskList.findFirst({
        where: { id: listId, userId: user.id },
        select: { id: true },
      });
      if (!list) throw new ApiError("List not found", 404);
    }

    let targetId = user.id;
    if (userId && userId !== user.id) {
      const isSenior =
        user.role === "ADMIN" || user.role === "OWNER" ||
        user.role === "MANAGER" || user.designation === "HEAD_OF_DESIGN";
      if (!isSenior) throw new ApiError("Only managers or admins can add to a teammate's calendar", 403);
      const target = await prisma.user.findFirst({
        where: { id: userId, organizationId: user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!target) throw new ApiError("Teammate not found", 404);
      targetId = userId;
    }

    const item = await prisma.personalItem.create({
      data: {
        userId: targetId,
        createdById: user.id,
        title: title.trim(),
        note: note?.trim() || null,
        date: new Date(date),
        time: time?.trim() || null,
        // Lists are personal — never attach when dropping onto a teammate.
        listId: targetId === user.id ? listId || null : null,
        starred: !!starred,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    if (targetId !== user.id) {
      await notify({
        organizationId: user.organizationId,
        userId: targetId,
        type: "CALENDAR_ITEM_ADDED",
        title: `${user.name} added to your calendar: ${item.title}`,
        body: note?.trim() || null,
        link: "/my-calendar",
      });
    }
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/personal-items");
  }
}
