import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

/**
 * The staff directory.
 *
 * Two shapes, and which one you get is decided here on the server rather
 * than by the page hiding a column:
 *
 *   hr.records       name, role, craft, phone, joining date, employment type
 *   payroll.manage   the same, plus monthlySalary and the advances balance
 *
 * `monthlySalary` is never selected at all without payroll.manage — not
 * selected-then-stripped. A field that is never read cannot be leaked by a
 * later refactor that forgets to strip it.
 */

const BASE_PROFILE = {
  phone: true, dateOfBirth: true, dateOfJoining: true, address: true,
  emergencyName: true, emergencyPhone: true, employmentType: true, notes: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "hr.records");
    const seesPay = can(user, "payroll.manage");

    const people = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(req.nextUrl.searchParams.get("includeInactive") === "1" ? {} : { isActive: true }),
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true, role: true,
        isActive: true, createdAt: true,
        jobTitle: { select: { id: true, name: true } },
        staffProfile: {
          select: seesPay ? { ...BASE_PROFILE, monthlySalary: true } : BASE_PROFILE,
        },
      },
      orderBy: { name: "asc" },
    });

    // The running advance balance belongs to the same row on screen, but it
    // is money — so it is only fetched for someone who may see money.
    const balances = seesPay
      ? await prisma.staffAdvance.groupBy({
          by: ["userId"],
          where: { organizationId: user.organizationId, closedAt: null },
          _sum: { amount: true, amountRepaid: true },
        })
      : [];
    const owedBy = new Map(
      balances.map((b) => [
        b.userId,
        Math.max(0, Number(b._sum.amount ?? 0) - Number(b._sum.amountRepaid ?? 0)),
      ]),
    );

    return NextResponse.json({
      seesPay,
      staff: people.map((p) => {
        const prof = p.staffProfile as (typeof p.staffProfile & { monthlySalary?: unknown }) | null;
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          avatarUrl: p.avatarUrl,
          role: p.role,
          isActive: p.isActive,
          craft: p.jobTitle?.name ?? null,
          jobTitleId: p.jobTitle?.id ?? null,
          phone: prof?.phone ?? null,
          dateOfBirth: prof?.dateOfBirth?.toISOString() ?? null,
          dateOfJoining: prof?.dateOfJoining?.toISOString() ?? null,
          address: prof?.address ?? null,
          emergencyName: prof?.emergencyName ?? null,
          emergencyPhone: prof?.emergencyPhone ?? null,
          employmentType: prof?.employmentType ?? "FULL_TIME",
          notes: prof?.notes ?? null,
          ...(seesPay
            ? {
                monthlySalary: prof?.monthlySalary != null ? Number(prof.monthlySalary) : null,
                advanceOutstanding: owedBy.get(p.id) ?? 0,
              }
            : {}),
        };
      }),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/hr/staff");
  }
}

/**
 * PATCH /api/hr/staff — write somebody's record.
 *
 * One route for the whole profile, because it is one form. The salary is the
 * exception: it is only read off the body when the caller has
 * payroll.manage, so a manager saving a phone number cannot smuggle a pay
 * rise through the same request.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "hr.manage");

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "");
    if (!userId) throw new ApiError("Which person?", 400);

    const member = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!member) throw new ApiError("That person isn't on this team", 404);

    const str = (v: unknown, max = 200) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    const day = (v: unknown) => {
      if (!v || typeof v !== "string") return null;
      const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const data: Record<string, unknown> = {
      phone: str(body.phone, 40),
      dateOfBirth: day(body.dateOfBirth),
      dateOfJoining: day(body.dateOfJoining),
      address: str(body.address, 500),
      emergencyName: str(body.emergencyName, 120),
      emergencyPhone: str(body.emergencyPhone, 40),
      notes: str(body.notes, 1000),
    };
    if (["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"].includes(String(body.employmentType))) {
      data.employmentType = body.employmentType;
    }

    // Only read at all when the caller may set it.
    if (can(user, "payroll.manage") && body.monthlySalary !== undefined) {
      const n = Number(body.monthlySalary);
      if (body.monthlySalary === null || body.monthlySalary === "") data.monthlySalary = null;
      else if (!Number.isFinite(n) || n < 0) throw new ApiError("Salary must be a positive number", 400);
      else data.monthlySalary = n;
    }

    await prisma.staffProfile.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId, organizationId: user.organizationId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/hr/staff");
  }
}
