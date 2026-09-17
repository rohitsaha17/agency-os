import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { isMonthKey, monthKey, payslip, outstanding } from "@/lib/hr";

/**
 * The salary sheet for a month.
 *
 * Everything here is payroll.manage — including the GET, because a salary
 * sheet is the single most sensitive screen in this product.
 *
 * The sheet is not stored. It is built each time from the staff on the books
 * plus whatever SalaryPayment rows exist for that month, so somebody hired
 * mid-month appears without anybody regenerating anything, and a month that
 * was never touched shows everyone as unpaid rather than as missing.
 */

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "payroll.manage");

    const month = req.nextUrl.searchParams.get("month") ?? monthKey();
    if (!MONTH_RE.test(month) || !isMonthKey(month)) {
      throw new ApiError("A month is required, as YYYY-MM", 400);
    }

    const [people, paid, advances] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: {
          id: true, name: true, avatarUrl: true,
          jobTitle: { select: { name: true } },
          staffProfile: { select: { monthlySalary: true, employmentType: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.salaryPayment.findMany({
        where: { organizationId: user.organizationId, month },
        select: {
          id: true, userId: true, grossAmount: true, advanceDeducted: true,
          netAmount: true, status: true, paidOn: true, note: true,
        },
      }),
      prisma.staffAdvance.groupBy({
        by: ["userId"],
        where: { organizationId: user.organizationId, closedAt: null },
        _sum: { amount: true, amountRepaid: true },
      }),
    ]);

    const paidBy = new Map(paid.map((p) => [p.userId, p]));
    const owedBy = new Map(
      advances.map((a) => [
        a.userId,
        outstanding(Number(a._sum.amount ?? 0), Number(a._sum.amountRepaid ?? 0)),
      ]),
    );

    const rows = people.map((p) => {
      const row = paidBy.get(p.id);
      const salary = p.staffProfile?.monthlySalary != null ? Number(p.staffProfile.monthlySalary) : null;
      const owed = owedBy.get(p.id) ?? 0;
      // A recorded payment is the truth for that month. Only where none
      // exists is the row a proposal built from the profile's salary.
      const gross = row ? Number(row.grossAmount) : salary ?? 0;
      const deducted = row ? Number(row.advanceDeducted) : 0;
      return {
        userId: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        craft: p.jobTitle?.name ?? null,
        employmentType: p.staffProfile?.employmentType ?? "FULL_TIME",
        /** Null means nobody has set a salary yet — not zero. */
        monthlySalary: salary,
        advanceOutstanding: owed,
        paymentId: row?.id ?? null,
        gross,
        advanceDeducted: deducted,
        net: row ? Number(row.netAmount) : gross,
        status: row?.status ?? "UNPAID",
        paidOn: row?.paidOn?.toISOString() ?? null,
        note: row?.note ?? null,
      };
    });

    return NextResponse.json({
      month,
      rows,
      totals: {
        people: rows.length,
        /** Nobody's salary set yet — the sheet says so instead of printing 0. */
        unset: rows.filter((r) => r.monthlySalary == null).length,
        gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
        deducted: round2(rows.reduce((s, r) => s + r.advanceDeducted, 0)),
        net: round2(rows.reduce((s, r) => s + r.net, 0)),
        paid: round2(rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.net, 0)),
        paidCount: rows.filter((r) => r.status === "PAID").length,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/payroll");
  }
}

/**
 * POST /api/hr/payroll — record that somebody has been paid for a month.
 *
 * Recovering an advance out of a payslip does two things that have to agree:
 * it lowers the net, and it raises what has been repaid on the advance. Both
 * happen in one transaction, because a payslip that says money was recovered
 * while the loan still shows the full balance is worse than either on its own.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "payroll.manage");

    const body = await req.json().catch(() => ({}));
    const month = String(body.month ?? "");
    const userId = String(body.userId ?? "");
    if (!MONTH_RE.test(month) || !isMonthKey(month)) throw new ApiError("A month is required, as YYYY-MM", 400);
    if (!userId) throw new ApiError("Which person?", 400);

    const member = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
      select: { id: true, staffProfile: { select: { monthlySalary: true } } },
    });
    if (!member) throw new ApiError("That person isn't on this team", 404);

    const profileSalary = member.staffProfile?.monthlySalary != null
      ? Number(member.staffProfile.monthlySalary) : null;
    const gross = body.gross != null ? Number(body.gross) : profileSalary;
    if (gross == null || !Number.isFinite(gross) || gross < 0) {
      throw new ApiError("Set a monthly salary for this person first, or enter an amount.", 400);
    }

    const open = await prisma.staffAdvance.findMany({
      where: { organizationId: user.organizationId, userId, closedAt: null },
      select: { id: true, amount: true, amountRepaid: true },
      orderBy: { givenOn: "asc" },
    });
    const owed = open.reduce(
      (s, a) => s + outstanding(Number(a.amount), Number(a.amountRepaid)), 0);

    const slip = payslip(gross, Number(body.advanceDeducted ?? 0), owed);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.upsert({
        where: { userId_month: { userId, month } },
        update: {
          grossAmount: slip.gross,
          advanceDeducted: slip.deduction,
          netAmount: slip.net,
          status: "PAID",
          paidOn: new Date(),
          note,
        },
        create: {
          organizationId: user.organizationId,
          userId, month,
          grossAmount: slip.gross,
          advanceDeducted: slip.deduction,
          netAmount: slip.net,
          status: "PAID",
          paidOn: new Date(),
          note,
        },
        select: { id: true, netAmount: true, advanceDeducted: true, status: true, paidOn: true },
      });

      // Oldest advance first, so a long-standing loan clears before a recent
      // one rather than both sitting half-paid forever.
      let left = slip.deduction;
      for (const a of open) {
        if (left <= 0) break;
        const due = outstanding(Number(a.amount), Number(a.amountRepaid));
        const take = Math.min(due, left);
        if (take <= 0) continue;
        const nowRepaid = Number(a.amountRepaid) + take;
        await tx.staffAdvance.update({
          where: { id: a.id },
          data: {
            amountRepaid: nowRepaid,
            closedAt: nowRepaid >= Number(a.amount) ? new Date() : null,
          },
        });
        left -= take;
      }

      return payment;
    });

    return NextResponse.json({
      id: result.id,
      status: result.status,
      net: Number(result.netAmount),
      advanceDeducted: Number(result.advanceDeducted),
      paidOn: result.paidOn?.toISOString() ?? null,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/hr/payroll");
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
