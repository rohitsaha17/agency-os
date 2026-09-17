import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";
import { notifyMany } from "@/lib/notify";
import {
  dayKey, dayString, leaveDays, validateLeaveReason, validateLeaveRange,
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
 * POST /api/hr/leave — ask for time off.
 *
 * The request does NOT carry whether it is paid. That is the approver's
 * decision, and letting the requester propose it would turn every approval
 * into a negotiation about the label rather than the days.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "attendance.mark");

    const body = await req.json().catch(() => ({}));
    const start = String(body.start ?? "");
    const end = String(body.end ?? start);
    const reason = String(body.reason ?? "");

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
        userId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (clash) {
      throw new ApiError(
        `You already have a ${clash.status.toLowerCase()} request covering ` +
        `${dayString(clash.startDate)} to ${dayString(clash.endDate)}.`,
        409,
      );
    }

    const created = await prisma.leaveRequest.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        startDate, endDate,
        reason: reason.trim(),
      },
      select: SELECT,
    });

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
