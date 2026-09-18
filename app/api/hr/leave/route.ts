import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";
import { notify, notifyMany } from "@/lib/notify";
import {
  dayKey, dayString, leaveDays, validateLeaveReason, validateLeaveRange,
  leaveBlockRows,
} from "@/lib/hr";

const SELECT = {
  id: true, userId: true, startDate: true, endDate: true, reason: true,
  status: true, kind: true, decidedAt: true, decisionNote: true, createdAt: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

function serialize(r: {
  startDate: Date; endDate: Date; decidedAt: Date | null; createdAt: Date;
  [k: string]: unknown;
}) {
  return {
    ...r,
    start: dayString(r.startDate),
    end: dayString(r.endDate),
    days: leaveDays(r.startDate, r.endDate),
    startDate: undefined,
    endDate: undefined,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * GET /api/hr/leave[?scope=mine|all][&status=PENDING]
 *
 * Your own requests need no capability — they are yours. `scope=all` is the
 * approver's inbox and takes hr.manage.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const wantsAll = sp.get("scope") === "all";
    const status = sp.get("status");

    if (wantsAll) requireCapability(user, "hr.manage");

    const rows = await prisma.leaveRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(wantsAll ? {} : { userId: user.id }),
        ...(status ? { status: status as never } : {}),
      },
      select: SELECT,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 200,
    });

    return NextResponse.json({
      canDecide: can(user, "hr.manage"),
      requests: rows.map(serialize),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/leave");
  }
}

/**
 * POST /api/hr/leave — ask for time off, or record somebody else's.
 *
 * Two callers, told apart by whether `userId` is somebody else:
 *
 *   YOURSELF     A request. It does NOT carry whether it is paid — that is
 *                the approver's decision, and letting the requester propose
 *                it would turn every approval into a negotiation about the
 *                label rather than the days.
 *
 *   SOMEBODY ELSE  hr.manage, and it lands APPROVED with the days already
 *                blocked. An admin entering leave for a person who phoned in
 *                is not making a request of themselves — routing it through
 *                pending, so they can then approve their own entry, is a form
 *                to fill in twice for no decision that was ever in doubt.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "attendance.mark");

    const body = await req.json().catch(() => ({}));
    const start = String(body.start ?? "");
    const end = String(body.end ?? start);
    const reason = String(body.reason ?? "");

    const forUser = String(body.userId ?? "") || user.id;
    const onBehalf = forUser !== user.id;
    const kind = body.kind ? String(body.kind).toUpperCase() : null;

    if (onBehalf) {
      requireCapability(user, "hr.manage");
      if (kind !== "PAID" && kind !== "UNPAID") {
        throw new ApiError("Say whether this is paid or unpaid leave.", 400);
      }
      const member = await prisma.user.findFirst({
        where: { id: forUser, organizationId: user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!member) throw new ApiError("That person isn't on this team", 404);
    }

    const badRange = validateLeaveRange(start, end);
    if (badRange) throw new ApiError(badRange, 400);
    const badReason = validateLeaveReason(reason);
    if (badReason) throw new ApiError(badReason, 400);

    const startDate = dayKey(start);
    const endDate = dayKey(end);

    // Asking twice for days already asked for makes an approver's inbox
    // meaningless, so an overlapping open request is refused rather than
    // silently duplicated.
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: forUser,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (clash) {
      throw new ApiError(
        `${onBehalf ? "They" : "You"} already have a ${clash.status.toLowerCase()} request covering ` +
        `${dayString(clash.startDate)} to ${dayString(clash.endDate)}.`,
        409,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({
        data: {
          organizationId: user.organizationId,
          userId: forUser,
          startDate, endDate,
          reason: reason.trim(),
          ...(onBehalf
            ? {
                status: "APPROVED" as const,
                kind: kind as "PAID" | "UNPAID",
                decidedById: user.id,
                decidedAt: new Date(),
              }
            : {}),
        },
        select: SELECT,
      });

      // Recorded as approved means the days are blocked now, in the same
      // transaction — the whole point of the admin path is that it is done
      // when they let go of the button.
      if (onBehalf) {
        await tx.unavailability.createMany({
          data: leaveBlockRows({
            organizationId: user.organizationId,
            userId: forUser,
            leaveRequestId: row.id,
            start: startDate,
            end: endDate,
            createdById: user.id,
          }),
          skipDuplicates: true,
        });
      }
      return row;
    });

    if (onBehalf) {
      // Tell the person it was recorded for. Finding out you are on the books
      // as off by noticing you cannot be assigned work is not how anybody
      // should learn it.
      const days = leaveDays(startDate, endDate);
      await notify({
        organizationId: user.organizationId,
        userId: forUser,
        type: "LEAVE_APPROVED",
        title: `Leave recorded — ${dayString(startDate)}${days > 1 ? ` – ${dayString(endDate)}` : ""} (${kind === "PAID" ? "paid" : "unpaid"})`,
        body: reason.trim(),
        link: "/hr?tab=leave",
      }).catch(() => { /* the record stands either way */ });
      return NextResponse.json(serialize(created), { status: 201 });
    }

    // Whoever can decide it should know it is waiting. A request nobody is
    // told about is a request nobody answers.
    const approvers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
        id: { not: user.id },
      },
      select: { id: true },
    });
    if (approvers.length) {
      const days = leaveDays(startDate, endDate);
      await notifyMany(
        approvers.map((a) => a.id),
        {
          organizationId: user.organizationId,
          type: "LEAVE_REQUESTED",
          title: `${user.name} asked for ${days} day${days === 1 ? "" : "s"} off`,
          body: `${dayString(startDate)}${days > 1 ? ` – ${dayString(endDate)}` : ""} · ${reason.trim()}`,
          link: "/hr?tab=leave",
        },
      ).catch(() => { /* a failed notification must not lose the request */ });
    }

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/hr/leave");
  }
}
