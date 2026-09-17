import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { outstanding } from "@/lib/hr";

/**
 * Advances and loans to staff.
 *
 * An advance is next month's pay, early. A loan is money lent that comes
 * back over several months. Same shape, so one table with a label rather
 * than two tables and two screens.
 *
 * Outstanding is never stored — it is amount minus amountRepaid, computed on
 * the way out. A stored balance is a third number that can disagree with the
 * other two, and eventually does.
 *
 * All of it is payroll.manage. What a colleague has borrowed is as private
 * as what they earn.
 */

const SELECT = {
  id: true, userId: true, kind: true, amount: true, amountRepaid: true,
  givenOn: true, note: true, closedAt: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

function serialize(a: {
  amount: unknown; amountRepaid: unknown; givenOn: Date; closedAt: Date | null;
  [k: string]: unknown;
}) {
  const amount = Number(a.amount);
  const repaid = Number(a.amountRepaid);
  return {
    ...a,
    amount,
    amountRepaid: repaid,
    outstanding: outstanding(amount, repaid),
    givenOn: a.givenOn.toISOString(),
    closedAt: a.closedAt?.toISOString() ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "payroll.manage");

    const userId = req.nextUrl.searchParams.get("userId");
    const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "1";

    const rows = await prisma.staffAdvance.findMany({
      where: {
        organizationId: user.organizationId,
        ...(userId ? { userId } : {}),
        ...(includeClosed ? {} : { closedAt: null }),
      },
      select: SELECT,
      orderBy: [{ closedAt: "asc" }, { givenOn: "desc" }],
      take: 200,
    });

    const items = rows.map(serialize);
    return NextResponse.json({
      advances: items,
      totals: {
        outstanding: Math.round(items.reduce((s, a) => s + a.outstanding, 0) * 100) / 100,
        open: items.filter((a) => !a.closedAt).length,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/advances");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "payroll.manage");

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "");
    const amount = Number(body.amount);
    const kind = String(body.kind ?? "ADVANCE").toUpperCase();

    if (!userId) throw new ApiError("Which person?", 400);
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError("Enter an amount greater than zero", 400);
    if (kind !== "ADVANCE" && kind !== "LOAN") throw new ApiError("Kind must be ADVANCE or LOAN", 400);

    const member = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!member) throw new ApiError("That person isn't on this team", 404);

    const created = await prisma.staffAdvance.create({
      data: {
        organizationId: user.organizationId,
        userId,
        kind: kind as "ADVANCE" | "LOAN",
        amount,
        givenOn: body.givenOn ? new Date(body.givenOn) : new Date(),
        note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : null,
      },
      select: SELECT,
    });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/hr/advances");
  }
}

/**
 * PATCH /api/hr/advances — record a repayment made outside payroll.
 *
 * Cash handed back, or a bank transfer. Payroll recovery has its own path
 * (POST /api/hr/payroll) because that one also has to move the payslip.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "payroll.manage");

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const repay = Number(body.repay);
    if (!id) throw new ApiError("Which advance?", 400);
    if (!Number.isFinite(repay) || repay <= 0) throw new ApiError("Enter an amount greater than zero", 400);

    const row = await prisma.staffAdvance.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, amount: true, amountRepaid: true },
    });
    if (!row) throw new ApiError("Not found", 404);

    const amount = Number(row.amount);
    const due = outstanding(amount, Number(row.amountRepaid));
    if (due <= 0) throw new ApiError("That one is already settled.", 409);

    // Capped at what is owed: repaying more than was borrowed is a data
    // entry mistake, not a credit.
    const taken = Math.min(repay, due);
    const nowRepaid = Number(row.amountRepaid) + taken;

    const updated = await prisma.staffAdvance.update({
      where: { id },
      data: {
        amountRepaid: nowRepaid,
        closedAt: nowRepaid >= amount ? new Date() : null,
      },
      select: SELECT,
    });
    return NextResponse.json(serialize(updated));
  } catch (error) {
    return handleApiError(error, "PATCH /api/hr/advances");
  }
}
