/**
 * v3 — quota maths for ONE cycle of ONE project (docs/V3_CONTEXT.md §3).
 *
 * v2's lib/quota.ts counted a CLIENT's month against their package. v3 counts
 * a PROJECT's cycle against its deliverables, which is what the Plan tab's
 * meters read. The old module stays for the client roll-up until Phase 6
 * retires packages entirely.
 *
 * The rule that makes the numbers add up: an item carried in ABOVE_QUOTA
 * doesn't consume this cycle's allowance — it sits beside it. One carried in
 * INSIDE_QUOTA does.
 */
import { prisma } from "@/lib/prisma";

/** Statuses that mean "this slot is spoken for". */
const COMMITTED: readonly string[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW", "SUBMITTED",
  "CHANGES_REQUESTED", "APPROVED", "TEAM_APPROVED", "CLIENT_APPROVED",
  "SCHEDULED", "POSTED",
];

export interface QuotaRow {
  creativeType: { id: string; name: string; icon: string | null; color: string | null };
  /** How many the deal owes per cycle. 0 = not part of the deal. */
  quota: number;
  /** Committed items that count against the quota. */
  planned: number;
  posted: number;
  /** Beyond the quota, or flagged EXTRA_BILLABLE. */
  extra: number;
  /** Carried in from a previous cycle and sitting outside the quota. */
  carriedInExtra: number;
  /** Carried in and consuming this cycle's quota. */
  carriedInQuota: number;
  full: boolean;
}

export interface CycleSummary {
  cycleId: string;
  label: string;
  status: "OPEN" | "CLOSED";
  startDate: string;
  endDate: string;
  perType: QuotaRow[];
  totals: { quota: number; planned: number; posted: number; extra: number; missed: number };
}

/**
 * Everything the Plan tab needs to draw its meters for one cycle.
 * Returns null when the cycle doesn't exist or isn't in this org.
 */
export async function cycleSummary(
  cycleId: string,
  organizationId: string,
): Promise<CycleSummary | null> {
  const cycle = await prisma.projectCycle.findFirst({
    where: { id: cycleId, project: { organizationId } },
    select: {
      id: true, label: true, status: true, startDate: true, endDate: true,
      project: {
        select: {
          id: true,
          deliverables: {
            select: {
              qtyPerCycle: true,
              creativeType: { select: { id: true, name: true, icon: true, color: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!cycle) return null;

  const items = await prisma.contentItem.findMany({
    where: { cycleId },
    select: {
      id: true, status: true, creativeTypeId: true, isExtra: true,
      billingIntent: true, carriedFromId: true, carryMode: true,
      creativeType: { select: { id: true, name: true, icon: true, color: true } },
    },
  });

  // Deliverables first, then any creative type that got planned but isn't in
  // the deal — those are extras by definition and must still be visible.
  const rows = new Map<string, QuotaRow>();
  for (const d of cycle.project.deliverables) {
    rows.set(d.creativeType.id, {
      creativeType: d.creativeType,
      quota: d.qtyPerCycle,
      planned: 0, posted: 0, extra: 0, carriedInExtra: 0, carriedInQuota: 0, full: false,
    });
  }
  for (const i of items) {
    if (!rows.has(i.creativeTypeId)) {
      rows.set(i.creativeTypeId, {
        creativeType: i.creativeType,
        quota: 0, planned: 0, posted: 0, extra: 0, carriedInExtra: 0, carriedInQuota: 0, full: false,
      });
    }
  }

  let missed = 0;
  for (const i of items) {
    const row = rows.get(i.creativeTypeId)!;
    if (i.status === "MISSED") { missed++; continue; }
    if (i.status === "CARRIED_FORWARD") continue; // it lives in the next cycle now

    const isExtra = i.isExtra || i.billingIntent === "EXTRA_BILLABLE";
    const carriedInAbove = !!i.carriedFromId && i.carryMode === "ABOVE_QUOTA";

    if (carriedInAbove) {
      row.carriedInExtra++;
    } else if (isExtra) {
      row.extra++;
    } else if (COMMITTED.includes(i.status)) {
      row.planned++;
      // Carried in INSIDE_QUOTA: it eats this cycle's allowance (counted
      // above) but is worth showing as carried so the SMM knows why the
      // meter started part-full.
      if (i.carriedFromId) row.carriedInQuota++;
    }
    if (i.status === "POSTED") row.posted++;
  }

  const perType = [...rows.values()].map((r) => ({ ...r, full: r.quota > 0 && r.planned >= r.quota }));

  return {
    cycleId: cycle.id,
    label: cycle.label,
    status: cycle.status,
    startDate: cycle.startDate.toISOString(),
    endDate: cycle.endDate.toISOString(),
    perType,
    totals: {
      quota: perType.reduce((s, r) => s + r.quota, 0),
      planned: perType.reduce((s, r) => s + r.planned, 0),
      posted: perType.reduce((s, r) => s + r.posted, 0),
      extra: perType.reduce((s, r) => s + r.extra + r.carriedInExtra, 0),
      missed,
    },
  };
}

/**
 * Is this creative type's quota already fully planned for the cycle?
 * Drives the "Reels quota is full (15/15) — this will be an EXTRA" warning.
 */
export async function quotaCheck(
  cycleId: string,
  creativeTypeId: string,
  organizationId: string,
): Promise<{ full: boolean; used: number; quota: number }> {
  const summary = await cycleSummary(cycleId, organizationId);
  const row = summary?.perType.find((r) => r.creativeType.id === creativeTypeId);
  if (!row) return { full: false, used: 0, quota: 0 };
  return { full: row.full, used: row.planned, quota: row.quota };
}
