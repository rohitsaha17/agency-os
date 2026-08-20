/**
 * v3 — project cycles (docs/V3_CONTEXT.md §3).
 *
 * A cycle is one billing period of a project. RETAINER projects get one per
 * month from cycleStartDate; ONE_TIME projects get a single cycle spanning
 * start → end. Content is planned into a cycle, the cycle is closed
 * deliberately (Phase 6), and closing is what produces the billable items an
 * invoice is built from (Phase 7).
 *
 * Cycles are generated lazily: creating a project makes the current and next
 * one, and `ensureCycles` tops them up as time moves, so an open-ended
 * retainer never needs a scheduled job to stay usable.
 */
import { prisma } from "@/lib/prisma";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** First instant of the month containing `d`, in UTC. */
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Last instant of the month containing `d`, in UTC. */
export function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function cycleLabel(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export interface CycleWindow {
  label: string;
  startDate: Date;
  endDate: Date;
}

/**
 * The cycle windows a project should have, from its start up to
 * `throughMonthsAhead` months past today (or its end date, whichever
 * comes first).
 *
 * ONE_TIME → exactly one window covering the whole engagement, because a
 * website build is billed once however long it runs.
 */
export function planCycles(
  type: "ONE_TIME" | "RETAINER",
  startDate: Date,
  endDate: Date | null,
  now: Date,
  throughMonthsAhead = 1,
): CycleWindow[] {
  if (type === "ONE_TIME") {
    const end = endDate ?? monthEnd(startDate);
    return [{
      label: cycleLabel(startDate),
      startDate: monthStart(startDate),
      endDate: end > startDate ? end : monthEnd(startDate),
    }];
  }

  // A retainer runs from its start month to whichever comes first: the agreed
  // end, or a little past today so the SMM can always plan next month.
  const first = monthStart(startDate);
  const horizon = monthStart(addMonths(now, throughMonthsAhead));
  const last = endDate && monthStart(endDate) < horizon ? monthStart(endDate) : horizon;

  const windows: CycleWindow[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) {
    windows.push({ label: cycleLabel(m), startDate: m, endDate: monthEnd(m) });
    // Guard against a nonsense start date generating thousands of rows.
    if (windows.length >= 240) break;
  }
  return windows;
}

/**
 * Create any missing cycles for a project. Idempotent — the unique index on
 * (projectId, startDate) means a concurrent call can't double-create, and
 * re-running only fills gaps.
 *
 * Returns the number created.
 */
export async function ensureCycles(projectId: string, now = new Date()): Promise<number> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, type: true, cycleStartDate: true, cycleEndDate: true, startDate: true },
  });
  if (!project) return 0;

  // Fall back to the legacy startDate so projects created before v3 still
  // get cycles the first time someone opens their Plan tab.
  const start = project.cycleStartDate ?? project.startDate;
  if (!start) return 0;

  const wanted = planCycles(
    project.type === "RETAINER" ? "RETAINER" : "ONE_TIME",
    start,
    project.cycleEndDate,
    now,
  );

  const existing = await prisma.projectCycle.findMany({
    where: { projectId },
    select: { startDate: true },
  });
  const have = new Set(existing.map((c) => c.startDate.toISOString()));

  const missing = wanted.filter((w) => !have.has(w.startDate.toISOString()));
  if (missing.length === 0) return 0;

  const result = await prisma.projectCycle.createMany({
    data: missing.map((w) => ({
      projectId,
      label: w.label,
      startDate: w.startDate,
      endDate: w.endDate,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * The cycle a date falls in, creating cycles first if the project has drifted
 * past the ones it has. Returns null when the project has no schedule at all.
 */
export async function cycleForDate(projectId: string, date: Date) {
  await ensureCycles(projectId, date);
  return prisma.projectCycle.findFirst({
    where: { projectId, startDate: { lte: date }, endDate: { gte: date } },
  });
}

/** The cycle covering today, or the nearest upcoming one. */
export async function currentCycle(projectId: string, now = new Date()) {
  await ensureCycles(projectId, now);
  return (
    (await prisma.projectCycle.findFirst({
      where: { projectId, startDate: { lte: now }, endDate: { gte: now } },
    })) ??
    (await prisma.projectCycle.findFirst({
      where: { projectId },
      orderBy: { startDate: "asc" },
    }))
  );
}
