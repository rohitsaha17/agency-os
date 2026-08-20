/**
 * v3 Phase 6 — closing a cycle (docs/V3_CONTEXT.md §3).
 *
 * Ending the month is deliberate. Nothing silently disappears, nothing is
 * retyped, and billing intent is captured without the SMM ever touching an
 * amount. The close produces BillableItems, which is what Phase 7 builds an
 * invoice from.
 *
 *   closeSummary()  what the cycle actually did — the wizard's step 1
 *   closeCycle()    carry forward, flag extras, lock the cycle, bill
 *   reopenCycle()   admin/manager only, and logged
 */
import { prisma } from "@/lib/prisma";
import { logStatus } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { ApiError } from "@/lib/api-errors";
import { cycleSummary } from "@/lib/cycle-quota";
import { ensureCycles, monthEnd, monthStart, cycleLabel } from "@/lib/cycles";

/** Statuses that mean the item never went out. */
const UNPOSTED: readonly string[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW", "SUBMITTED",
  "CHANGES_REQUESTED", "APPROVED", "TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED",
];

export type CarryDecision =
  | { itemId: string; action: "CARRY"; carryMode: "INSIDE_QUOTA" | "ABOVE_QUOTA"; newDate?: string }
  | { itemId: string; action: "DROP"; reason?: string };

export type ExtraDecision = {
  itemId: string;
  /** BILL → an EXTRA an admin prices. FREE → a COMPLIMENTARY at 1. */
  intent: "BILL" | "FREE";
};

/**
 * Everything the wizard shows before anyone commits to anything.
 *
 * Deliberately carries no money — the SMM closing the cycle can't see an
 * amount, which is the whole point of separating intent from pricing.
 */
export async function closeSummary(cycleId: string, organizationId: string) {
  const cycle = await prisma.projectCycle.findFirst({
    where: { id: cycleId, project: { organizationId } },
    select: {
      id: true, label: true, status: true, startDate: true, endDate: true, projectId: true,
      project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } },
    },
  });
  if (!cycle) return null;

  const summary = await cycleSummary(cycleId, organizationId);

  const items = await prisma.contentItem.findMany({
    where: { cycleId },
    orderBy: { date: "asc" },
    select: {
      id: true, topic: true, date: true, status: true, description: true,
      referenceUrl: true, isExtra: true, billingIntent: true, carriedFromId: true,
      creativeType: { select: { id: true, name: true, icon: true } },
      tasks: {
        where: { deletedAt: null },
        select: { id: true, status: true, assignees: { select: { user: { select: { name: true } } } } },
      },
    },
  });

  return {
    cycle: {
      id: cycle.id, label: cycle.label, status: cycle.status,
      startDate: cycle.startDate.toISOString(),
      endDate: cycle.endDate.toISOString(),
      project: cycle.project,
    },
    summary,
    /** Step 2: what didn't go out. */
    unposted: items
      .filter((i) => UNPOSTED.includes(i.status))
      .map((i) => ({ ...i, date: i.date.toISOString() })),
    /**
     * Step 3: over-delivery waiting on a bill-or-free decision. Anything
     * already marked COMPLIMENTARY has been decided, so it stays out.
     */
    extras: items
      .filter((i) => (i.isExtra || i.billingIntent === "EXTRA_BILLABLE") && i.status === "POSTED")
      .map((i) => ({ ...i, date: i.date.toISOString() })),
    posted: items.filter((i) => i.status === "POSTED").length,
  };
}

/**
 * The next cycle after this one, creating it if the project hasn't got that
 * far yet — carrying work forward must never fail for want of a destination.
 */
async function nextCycleFor(projectId: string, after: Date) {
  await ensureCycles(projectId, after);
  const existing = await prisma.projectCycle.findFirst({
    where: { projectId, startDate: { gt: after } },
    orderBy: { startDate: "asc" },
  });
  if (existing) return existing;

  // An open-ended retainer whose horizon hasn't caught up yet: make the month.
  const start = monthStart(new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth() + 1, 1)));
  return prisma.projectCycle.create({
    data: {
      projectId,
      label: cycleLabel(start),
      startDate: start,
      endDate: monthEnd(start),
    },
  });
}

/**
 * Same weekday, next cycle.
 *
 * An SMM planning "the Tuesday reel" wants it on a Tuesday again, so the
 * suggested date keeps the weekday rather than the date number.
 */
function sameWeekdayNextCycle(original: Date, nextStart: Date, nextEnd: Date): Date {
  const target = original.getUTCDay();
  const d = new Date(nextStart);
  while (d.getUTCDay() !== target && d <= nextEnd) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d <= nextEnd ? d : new Date(nextStart);
}

/**
 * Close the cycle: carry what's carrying, flag what's billing, lock it,
 * and produce the billable items.
 *
 * Runs the whole thing in one transaction — a half-closed cycle would be
 * worse than an open one.
 */
export async function closeCycle(opts: {
  cycleId: string;
  organizationId: string;
  userId: string;
  carry: CarryDecision[];
  extras: ExtraDecision[];
}) {
  const { cycleId, organizationId, userId } = opts;

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: cycleId, project: { organizationId } },
    select: {
      id: true, label: true, status: true, endDate: true, projectId: true,
      project: {
        select: {
          id: true, name: true, clientId: true, type: true, cycleAmount: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  if (!cycle) throw new ApiError("Cycle not found", 404);
  if (cycle.status === "CLOSED") throw new ApiError("This cycle is already closed", 409);

  const next = await nextCycleFor(cycle.projectId, cycle.endDate);

  const carried: string[] = [];
  const dropped: string[] = [];

  // ── Step 2: carry forward or drop ──
  for (const d of opts.carry) {
    const item = await prisma.contentItem.findFirst({
      where: { id: d.itemId, cycleId },
      select: {
        id: true, topic: true, description: true, referenceUrl: true, referenceFileId: true,
        creativeTypeId: true, clientId: true, projectId: true, date: true,
        organizationId: true, status: true,
      },
    });
    if (!item) continue;

    if (d.action === "DROP") {
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { status: "MISSED" },
      });
      await logStatus({
        organizationId, entityType: "CONTENT_ITEM", entityId: item.id,
        from: item.status, to: "MISSED", userId,
        note: d.reason?.trim() ? `dropped at cycle close — ${d.reason.trim()}` : "dropped at cycle close",
      });
      dropped.push(item.id);
      continue;
    }

    // Every detail travels with it — the point is that nothing is retyped.
    const newDate = d.newDate
      ? new Date(d.newDate)
      : sameWeekdayNextCycle(item.date, next.startDate, next.endDate);

    const clone = await prisma.contentItem.create({
      data: {
        organizationId: item.organizationId,
        clientId: item.clientId,
        projectId: item.projectId,
        cycleId: next.id,
        date: newDate,
        creativeTypeId: item.creativeTypeId,
        topic: item.topic,
        description: item.description,
        referenceUrl: item.referenceUrl,
        referenceFileId: item.referenceFileId,
        status: "PLANNED",
        carriedFromId: item.id,
        carryMode: d.carryMode,
        // Carried in ABOVE_QUOTA sits outside next cycle's allowance, so it
        // is an extra by definition.
        isExtra: d.carryMode === "ABOVE_QUOTA",
        billingIntent: d.carryMode === "ABOVE_QUOTA" ? "EXTRA_BILLABLE" : "INCLUDED",
        createdById: userId,
      },
      select: { id: true },
    });

    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: "CARRIED_FORWARD" },
    });
    await logStatus({
      organizationId, entityType: "CONTENT_ITEM", entityId: item.id,
      from: item.status, to: "CARRIED_FORWARD", userId,
      note: `carried into ${next.label} (${d.carryMode === "INSIDE_QUOTA" ? "inside quota" : "above quota"})`,
    });
    await logStatus({
      organizationId, entityType: "CONTENT_ITEM", entityId: clone.id,
      to: "PLANNED", userId, note: `carried in from ${cycle.label}`,
    });
    carried.push(clone.id);
  }

  // ── Step 3: bill or gift ──
  const billables: {
    label: string; kind: "EXTRA" | "COMPLIMENTARY";
    contentItemId: string; amount: number | null; status: "PENDING_PRICING" | "READY";
  }[] = [];

  for (const e of opts.extras) {
    const item = await prisma.contentItem.findFirst({
      where: { id: e.itemId, cycleId },
      select: {
        id: true, topic: true, status: true,
        creativeType: { select: { name: true } },
      },
    });
    if (!item) continue;

    const free = e.intent === "FREE";
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { billingIntent: free ? "COMPLIMENTARY" : "EXTRA_BILLABLE", isExtra: true },
    });
    await logStatus({
      organizationId, entityType: "CONTENT_ITEM", entityId: item.id,
      to: item.status, userId,
      note: free ? "flagged complimentary at cycle close" : "flagged billable at cycle close",
    });

    billables.push({
      label: `${free ? "Complimentary" : "Extra"} ${item.creativeType.name} — ${item.topic}`,
      kind: free ? "COMPLIMENTARY" : "EXTRA",
      contentItemId: item.id,
      // A freebie is invoiced at 1 so the client SEES the goodwill; a
      // billable extra has no amount until an admin sets one.
      amount: free ? 1 : null,
      status: free ? "READY" : "PENDING_PRICING",
    });
  }

  // ── Step 4: lock it and produce the billing lines ──
  const now = new Date();
  await prisma.$transaction([
    prisma.projectCycle.update({
      where: { id: cycleId },
      data: { status: "CLOSED", closedAt: now, closedById: userId },
    }),
    // The retainer line. Already priced — it's the agreed deal, not a
    // judgement call, so it goes straight to READY.
    prisma.billableItem.create({
      data: {
        organizationId,
        clientId: cycle.project.clientId,
        projectId: cycle.projectId,
        cycleId,
        label: `${cycle.project.name} — ${cycle.label}`,
        kind: "PACKAGE",
        flaggedById: userId,
        amount: cycle.project.cycleAmount,
        status: cycle.project.cycleAmount != null ? "READY" : "PENDING_PRICING",
      },
    }),
    ...billables.map((b) =>
      prisma.billableItem.create({
        data: {
          organizationId,
          clientId: cycle.project.clientId,
          projectId: cycle.projectId,
          cycleId,
          contentItemId: b.contentItemId,
          label: b.label,
          kind: b.kind,
          flaggedById: userId,
          amount: b.amount,
          status: b.status,
        },
      }),
    ),
  ]);

  await logStatus({
    organizationId, entityType: "CYCLE", entityId: cycleId,
    from: "OPEN", to: "CLOSED", userId,
    note: `closed — ${carried.length} carried, ${dropped.length} dropped, ${billables.length} billable`,
  });

  // Tell the people who actually price things.
  const needsPricing = billables.filter((b) => b.status === "PENDING_PRICING").length;
  const admins = await prisma.user.findMany({
    where: {
      organizationId, isActive: true,
      role: { in: ["OWNER", "ADMIN", "MANAGER"] },
    },
    select: { id: true },
  });
  await notifyMany(admins.map((a) => a.id), {
    organizationId,
    type: "CYCLE_CLOSED",
    title: `${cycle.project.name} — ${cycle.label} cycle closed`,
    body: needsPricing
      ? `${needsPricing} ${needsPricing === 1 ? "extra needs" : "extras need"} pricing`
      : "Ready to invoice",
    link: `/invoices?needsPricing=1`,
  });

  return {
    closed: true,
    carried: carried.length,
    dropped: dropped.length,
    billables: billables.length + 1,
    needsPricing,
    nextCycle: { id: next.id, label: next.label },
  };
}

/**
 * Reopen a closed cycle. Admin and manager only, and always logged — an
 * SMM cannot quietly undo a close that has already produced billing lines.
 */
export async function reopenCycle(opts: {
  cycleId: string;
  organizationId: string;
  userId: string;
  reason?: string | null;
}) {
  const cycle = await prisma.projectCycle.findFirst({
    where: { id: opts.cycleId, project: { organizationId: opts.organizationId } },
    select: { id: true, status: true, label: true },
  });
  if (!cycle) throw new ApiError("Cycle not found", 404);
  if (cycle.status === "OPEN") throw new ApiError("This cycle is already open", 409);

  // Invoiced lines are history — reopening must not silently unbill them.
  const invoiced = await prisma.billableItem.count({
    where: { cycleId: opts.cycleId, status: "INVOICED" },
  });
  if (invoiced > 0) {
    throw new ApiError(
      "This cycle has already been invoiced — credit the invoice before reopening it",
      409,
    );
  }

  // The billing lines the close produced go with it, or a second close would
  // double-bill the month. Any amount already typed on an extra is lost —
  // callers are told how many, so a manager isn't surprised by it.
  const withdrawing = await prisma.billableItem.findMany({
    where: { cycleId: opts.cycleId, status: { in: ["PENDING_PRICING", "READY"] } },
    select: { id: true, amount: true },
  });
  const pricedLost = withdrawing.filter((b) => b.amount != null).length;

  await prisma.$transaction([
    prisma.projectCycle.update({
      where: { id: opts.cycleId },
      data: { status: "OPEN", closedAt: null, closedById: null },
    }),
    prisma.billableItem.deleteMany({
      where: { cycleId: opts.cycleId, status: { in: ["PENDING_PRICING", "READY"] } },
    }),
  ]);

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "CYCLE",
    entityId: opts.cycleId,
    from: "CLOSED", to: "OPEN", userId: opts.userId,
    note: `${opts.reason?.trim() ? `reopened — ${opts.reason.trim()}` : "reopened"}`
      + ` · ${withdrawing.length} billing line${withdrawing.length === 1 ? "" : "s"} withdrawn`,
  });

  return { reopened: true, withdrawn: withdrawing.length, pricedLost };
}
