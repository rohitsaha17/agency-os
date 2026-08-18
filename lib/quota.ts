import { prisma } from "@/lib/prisma";

export interface TypeSummaryRow {
  creativeType: { id: string; name: string; icon: string | null; color: string | null; countsAsShoot: boolean };
  quota: number;
  planned: number;   // items in PLANNED..SCHEDULED dated that month
  posted: number;    // POSTED that month
  extra: number;     // isExtra items that month
  carriedIn: number; // items with carriedFromId dated this month (counting here)
  carriedOut: number; // this month's MISSED items with a clone elsewhere
}

export interface MonthSummary {
  month: string; // YYYY-MM
  package: {
    id: string; name: string;
    billingAmount: number | null; currency: string | null; notes: string | null;
  } | null;
  perType: TypeSummaryRow[];
  adHocCount: number;
  shootsPlanned: number;
  shootsDone: number;
  totals: { quota: number; planned: number; posted: number; extra: number; carriedIn: number; carriedOut: number };
}

const COMMITTED = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW", "TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED"] as const;

/**
 * Phase-6 counting rules (docs/V2_CONTEXT.md):
 *  planned    = items in PLANNED..SCHEDULED dated that month
 *  posted     = POSTED that month
 *  extra      = isExtra items that month
 *  carriedIn  = items with carriedFromId dated this month; they count against
 *               THIS month unless countAgainstPrevMonth is set
 *  carriedOut = this month's MISSED items that have a clone (carry target)
 *  shoots     = countsAsShoot types (bookings add in Phase 9)
 */
export async function computeMonthSummary(
  organizationId: string,
  clientId: string,
  monthYYYYMM: string,
): Promise<MonthSummary> {
  const [y, m] = monthYYYYMM.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const monthStart = from;

  const [items, pkg, types, bookingCounts] = await Promise.all([
    prisma.contentItem.findMany({
      where: { organizationId, clientId, date: { gte: from, lt: to } },
      select: {
        id: true, status: true, isExtra: true, isAdHoc: true,
        carriedFromId: true, countAgainstPrevMonth: true, creativeTypeId: true,
        carriedTo: { select: { id: true } },
      },
    }),
    prisma.clientPackage.findFirst({
      where: {
        organizationId, clientId, isActive: true,
        startMonth: { lte: monthStart },
        OR: [{ endMonth: null }, { endMonth: { gte: monthStart } }],
      },
      include: { quotas: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creativeType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    // Phase 9: photographer bookings feed the shoot counters
    prisma.booking.groupBy({
      by: ["status"],
      where: { organizationId, clientId, startAt: { gte: from, lt: to } },
      _count: { _all: true },
    }),
  ]);

  const bookingsConfirmed = bookingCounts
    .filter((r) => r.status === "CONFIRMED" || r.status === "REQUESTED")
    .reduce((s, r) => s + r._count._all, 0);
  const bookingsCompleted = bookingCounts
    .filter((r) => r.status === "COMPLETED")
    .reduce((s, r) => s + r._count._all, 0);

  const quotaByType = new Map<string, number>(pkg?.quotas.map((q) => [q.creativeTypeId, q.monthlyQty]) ?? []);

  const perType: TypeSummaryRow[] = types.map((t) => {
    const mine = items.filter((i) => i.creativeTypeId === t.id);
    // carried-in items flagged countAgainstPrevMonth are excluded from this
    // month's counts (they consumed last month's quota instead)
    const counting = mine.filter((i) => !(i.carriedFromId && i.countAgainstPrevMonth));
    return {
      creativeType: { id: t.id, name: t.name, icon: t.icon, color: t.color, countsAsShoot: t.countsAsShoot },
      quota: quotaByType.get(t.id) ?? 0,
      planned: counting.filter((i) => (COMMITTED as readonly string[]).includes(i.status)).length,
      posted: counting.filter((i) => i.status === "POSTED").length,
      extra: counting.filter((i) => i.isExtra).length,
      carriedIn: mine.filter((i) => !!i.carriedFromId).length,
      carriedOut: mine.filter((i) => i.status === "MISSED" && i.carriedTo.length > 0).length,
    };
  });

  const shootRows = perType.filter((r) => r.creativeType.countsAsShoot);
  const totals = perType.reduce(
    (acc, r) => ({
      quota: acc.quota + r.quota,
      planned: acc.planned + r.planned,
      posted: acc.posted + r.posted,
      extra: acc.extra + r.extra,
      carriedIn: acc.carriedIn + r.carriedIn,
      carriedOut: acc.carriedOut + r.carriedOut,
    }),
    { quota: 0, planned: 0, posted: 0, extra: 0, carriedIn: 0, carriedOut: 0 },
  );

  return {
    month: monthYYYYMM,
    package: pkg
      ? {
          id: pkg.id, name: pkg.name,
          billingAmount: pkg.billingAmount != null ? Number(pkg.billingAmount) : null,
          currency: pkg.currency, notes: pkg.notes,
        }
      : null,
    perType,
    adHocCount: items.filter((i) => i.isAdHoc).length,
    shootsPlanned: shootRows.reduce((s, r) => s + r.planned, 0) + bookingsConfirmed,
    shootsDone: shootRows.reduce((s, r) => s + r.posted, 0) + bookingsCompleted,
    totals,
  };
}
