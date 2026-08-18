import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notify } from "@/lib/notify";

// POST /api/personal-items — { title, date, time?, note?, userId? }
// userId (≠ self) = "add for teammate": ADMIN/MANAGER/OWNER or HEAD_OF_DESIGN
// only; the teammate is notified.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { title, date, time, note, userId } = await req.json();
    if (!title?.trim()) throw new ApiError("Title is required", 400);
    if (!date || isNaN(new Date(date).getTime())) throw new ApiError("A valid date is required", 400);

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
