import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notify } from "@/lib/notify";
import { dayString, leaveDays, canDecide, canCancel, leaveBlockRows } from "@/lib/hr";
import { can } from "@/lib/permissions";

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
 *   CANCEL             the person who asked, while it is still pending — or
 *                      an approver, who may also revoke one already approved
 *                      because plans change.
 *
 * Approval is also the moment leave becomes REAL: it writes the days into
 * `unavailability`, the table the assignment guard and the assignee picker
 * already read. That is why nothing new had to be taught to either of them.
 * A pending request blocks nothing — asking for a day off is not the same as
 * having it, and steering work away from somebody over a day that might not
 * be granted would be wrong.
 *
 * Both halves happen in one transaction. A leave marked approved whose days
 * are not blocked is worse than either outcome alone: it reads as handled
 * while the person stays bookable.
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
      const mayDecide = can(user, "hr.manage");
      if (!canCancel(row.status, row.userId === user.id, mayDecide)) {
        throw new ApiError(
          row.status === "APPROVED"
            ? "That leave is approved — an admin can revoke it."
            : row.userId !== user.id
              ? "Only the person who asked can withdraw it."
              : "That has already been decided.",
          403,
        );
      }
      // Revoking an approved leave has to take its blocked days with it, or
      // the diary keeps them off work for a trip that isn't happening.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.unavailability.deleteMany({ where: { leaveRequestId: id } });
        return tx.leaveRequest.update({
          where: { id },
          data: { status: "CANCELLED" },
          select: { id: true, status: true },
        });
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

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.leaveRequest.update({
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

      if (action === "APPROVE") {
        // skipDuplicates, because a photographer may already have blocked one
        // of these days for a shoot of their own. That row stays as it is —
        // the day is blocked either way, and replacing a specific reason with
        // a vaguer one would gain nothing.
        await tx.unavailability.createMany({
          data: leaveBlockRows({
            organizationId: user.organizationId,
            userId: row.userId,
            leaveRequestId: id,
            start: saved.startDate,
            end: saved.endDate,
            createdById: user.id,
          }),
          skipDuplicates: true,
        });
      }
      return saved;
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
