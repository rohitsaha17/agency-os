import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { dayString, leaveDays, canDecide, canCancel } from "@/lib/hr";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/hr/leave/[id] — decide it, or withdraw it.
 *
 * Two different acts on one row, told apart by who is asking:
 *
 *   APPROVE / REJECT   hr.manage. Approving REQUIRES a kind — paid or
 *                      unpaid — because an approved leave with no kind is a
 *                      decision that hasn't actually been made, and it is
 *                      the payroll sheet that later has to answer for it.
 *   CANCEL             the person who asked, while it is still pending.
 *                      After a decision it is a record of what was agreed,
 *                      not a draft.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").toUpperCase();

    const row = await prisma.leaveRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, userId: true, status: true, startDate: true, endDate: true,
        user: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new ApiError("Not found", 404);

    if (action === "CANCEL") {
      if (!canCancel(row.status, row.userId === user.id)) {
        throw new ApiError(
          row.userId !== user.id
            ? "Only the person who asked can withdraw it."
            : "That has already been decided — ask an admin to change it.",
          403,
        );
      }
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
        select: { id: true, status: true },
      });
      return NextResponse.json(updated);
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      throw new ApiError("Action must be APPROVE, REJECT or CANCEL", 400);
    }

    requireCapability(user, "hr.manage");
    if (!canDecide(row.status)) {
      throw new ApiError(`That request is already ${row.status.toLowerCase()}.`, 409);
    }

    const kind = body.kind ? String(body.kind).toUpperCase() : null;
    if (action === "APPROVE" && kind !== "PAID" && kind !== "UNPAID") {
      throw new ApiError("Say whether this is paid or unpaid leave.", 400);
    }

    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        kind: action === "APPROVE" ? (kind as "PAID" | "UNPAID") : null,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note,
      },
      select: {
        id: true, status: true, kind: true, startDate: true, endDate: true,
        decisionNote: true,
      },
    });

    const days = leaveDays(row.startDate, row.endDate);
    const when = `${dayString(row.startDate)}${days > 1 ? ` – ${dayString(row.endDate)}` : ""}`;
    await notify({
      organizationId: user.organizationId,
      userId: row.userId,
      type: action === "APPROVE" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      title: action === "APPROVE"
        ? `Leave approved — ${when} (${kind === "PAID" ? "paid" : "unpaid"})`
        : `Leave declined — ${when}`,
      body: note ?? undefined,
      link: "/hr?tab=leave",
    }).catch(() => { /* the decision stands whether or not the ping lands */ });

    return NextResponse.json({
      ...updated,
      start: dayString(updated.startDate),
      end: dayString(updated.endDate),
      days,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/hr/leave/[id]");
  }
}
