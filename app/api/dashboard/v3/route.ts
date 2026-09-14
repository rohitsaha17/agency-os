import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

/**
 * Promise.all with names.
 *
 * Keeping the keys means a query can be added or removed without renumbering
 * a positional destructure — which is how a parallel group this size quietly
 * acquires a bug.
 */
async function resolveAll<T extends Record<string, Promise<unknown>>>(
  obj: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(obj);
  const values = await Promise.all(Object.values(obj));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as never;
}

/**
 * GET /api/dashboard/v3 — the blocks THIS user's dashboard should show.
 *
 * One endpoint, capability-driven blocks (docs/V3_CONTEXT.md §8). Each role
 * lands somewhere useful rather than on the same page with things greyed
 * out, and money simply isn't computed for anyone without financials.view —
 * jsonFor strips it on the way out as a second layer.
 *
 * Every query is now issued in ONE parallel group. It used to be six groups
 * awaited one after another — my work, then review, then projects, then
 * cycles, then money, then workload — none of which needed anything from the
 * one before it. At ~193ms per database round trip (docs/perf/BASELINE.md),
 * fourteen queries in a queue is roughly 2.7 seconds of pure waiting, and it
 * was the single biggest cost on the page everybody opens first.
 *
 * The capability guards still decide what is BUILT, not merely what is shown:
 * a promise is only created for a block the user may see, so money is still
 * never computed for anyone without financials.view.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const orgId = user.organizationId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAhead = new Date(today.getTime() + 7 * 86400000);

    const seesMoney = can(user, "financials.view");
    const plans = can(user, "content.plan");
    const reviews = can(user, "tasks.review");
    const managesClients = can(user, "clients.manage");

    const {
      myOpen, myOverdue, myChangesRequested, myPostDue,
      awaitingMyReview, myProjects, closingSoon,
      invoices, receipts, expenses, needsPricing, overdueOrg, workload,
    } = await resolveAll({
      // ── Everyone: their own work ──
      myOpen: prisma.task.count({
        where: {
          organizationId: orgId, deletedAt: null,
          status: { notIn: ["DONE"] },
          assignees: { some: { userId: user.id } },
        },
      }),
      myOverdue: prisma.task.findMany({
        where: {
          organizationId: orgId, deletedAt: null,
          status: { notIn: ["DONE"] },
          dueDate: { lt: today },
          assignees: { some: { userId: user.id } },
        },
        select: {
          id: true, title: true, dueDate: true, kind: true,
          client: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),
      myChangesRequested: prisma.task.findMany({
        where: {
          organizationId: orgId, deletedAt: null,
          status: "CHANGES_REQUESTED",
          assignees: { some: { userId: user.id } },
        },
        select: {
          id: true, title: true, revision: true,
          client: { select: { name: true } },
        },
        take: 8,
      }),
      // The posting tasks that make an SMM's day
      myPostDue: prisma.task.findMany({
        where: {
          organizationId: orgId, deletedAt: null, kind: "POST",
          status: { not: "DONE" },
          dueDate: { lte: weekAhead },
          assignees: { some: { userId: user.id } },
        },
        select: {
          id: true, title: true, dueDate: true,
          client: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),

      // ── Reviewers: what's waiting on them ──
      awaitingMyReview: reviews
        ? prisma.task.count({
            where: {
              organizationId: orgId, deletedAt: null, status: "IN_REVIEW",
              ...(managesClients
                ? {}
                : {
                    OR: [
                      { approverId: user.id },
                      { project: { members: { some: { userId: user.id, role: "SMM" } } } },
                    ],
                  }),
            },
          })
        : Promise.resolve(0),

      // ── Planners: their projects and how each cycle is going ──
      myProjects: plans
        ? prisma.project.findMany({
            where: {
              organizationId: orgId,
              status: { in: ["ACTIVE", "DRAFT"] },
              ...(managesClients ? {} : { members: { some: { userId: user.id, role: "SMM" } } }),
            },
            select: {
              id: true, name: true, type: true,
              client: { select: { id: true, name: true } },
              deliverables: { select: { qtyPerCycle: true } },
              cycles: {
                where: { status: "OPEN", startDate: { lte: now }, endDate: { gte: now } },
                select: {
                  id: true, label: true, endDate: true,
                  contentItems: { select: { status: true, isExtra: true } },
                },
                take: 1,
              },
            },
            take: 12,
          })
        : Promise.resolve([]),

      // ── Cycles closing soon: worth a nudge before the month ends ──
      closingSoon: plans
        ? prisma.projectCycle.findMany({
            where: {
              status: "OPEN",
              endDate: { gte: today, lte: weekAhead },
              project: {
                organizationId: orgId,
                ...(managesClients ? {} : { members: { some: { userId: user.id, role: "SMM" } } }),
              },
            },
            select: {
              id: true, label: true, endDate: true,
              project: { select: { id: true, name: true, client: { select: { name: true } } } },
            },
            orderBy: { endDate: "asc" },
            take: 6,
          })
        : Promise.resolve([]),

      // ── Money: only built at all for those allowed to see it ──
      invoices: seesMoney
        ? prisma.invoice.findMany({
            where: { organizationId: orgId, status: { notIn: ["CANCELLED"] } },
            select: {
              status: true, discountPct: true, taxPct: true,
              lineItems: { select: { quantity: true, unitPrice: true } },
            },
          })
        : Promise.resolve([]),
      receipts: seesMoney
        ? prisma.receipt.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } })
        : Promise.resolve(null),
      expenses: seesMoney
        ? prisma.expense.aggregate({
            where: { organizationId: orgId, status: { in: ["APPROVED", "PAID"] } },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      needsPricing: seesMoney
        ? prisma.billableItem.count({
            where: { organizationId: orgId, status: "PENDING_PRICING" },
          })
        : Promise.resolve(0),
      overdueOrg: seesMoney
        ? prisma.task.count({
            where: {
              organizationId: orgId, deletedAt: null,
              status: { not: "DONE" }, dueDate: { lt: today },
            },
          })
        : Promise.resolve(0),

      // ── Team workload: who's carrying what (managers and above) ──
      workload: managesClients
        ? prisma.user.findMany({
            where: { organizationId: orgId, isActive: true },
            select: {
              id: true, name: true,
              jobTitle: { select: { name: true } },
              taskAssignments: {
                where: { task: { deletedAt: null, status: { notIn: ["DONE"] } } },
                // The task id was selected and never read. It is one column
                // per open assignment across the whole org, on every load.
                select: { task: { select: { status: true, dueDate: true } } },
              },
            },
          })
        : Promise.resolve([]),
    });

    const projectProgress = myProjects
      .filter((p) => p.cycles.length > 0)
      .map((p) => {
        const cycle = p.cycles[0];
        const quota = p.deliverables.reduce((s, d) => s + d.qtyPerCycle, 0);
        const posted = cycle.contentItems.filter((i) => i.status === "POSTED").length;
        const planned = cycle.contentItems.filter(
          (i) => !["MISSED", "CARRIED_FORWARD"].includes(i.status),
        ).length;
        return {
          id: p.id, name: p.name, client: p.client.name,
          cycleId: cycle.id, cycleLabel: cycle.label,
          endDate: cycle.endDate.toISOString(),
          quota, planned, posted,
          /** What still isn't on the calendar at all — the SMM's real to-do. */
          unplanned: Math.max(0, quota - planned),
        };
      });

    let money: Record<string, unknown> | null = null;
    if (seesMoney) {
      const lineTotal = (inv: (typeof invoices)[number]) => {
        const sub = inv.lineItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0);
        const disc = sub * (Number(inv.discountPct ?? 0) / 100);
        return (sub - disc) * (1 + Number(inv.taxPct ?? 0) / 100);
      };
      const invoiced = invoices.reduce((s, i) => s + lineTotal(i), 0);
      const collected = Number(receipts?._sum.amount ?? 0);

      money = {
        invoiced,
        collected,
        outstanding: Math.max(0, invoiced - collected),
        expenses: Number(expenses?._sum.amount ?? 0),
        needsPricing,
        overdueAcrossOrg: overdueOrg,
      };
    }

    return jsonFor(user, {
      role: user.role,
      blocks: {
        // What each role should actually be looking at
        myWork: true,
        review: reviews,
        planning: plans,
        money: seesMoney,
        team: managesClients,
      },
      myWork: {
        open: myOpen,
        overdue: myOverdue.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null })),
        changesRequested: myChangesRequested,
        postDue: myPostDue.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null })),
      },
      review: { awaiting: awaitingMyReview },
      planning: {
        projects: projectProgress,
        closingSoon: closingSoon.map((c) => ({ ...c, endDate: c.endDate.toISOString() })),
      },
      money,
      team: workload.map((u) => ({
        id: u.id,
        name: u.name,
        jobTitle: u.jobTitle?.name ?? null,
        open: u.taskAssignments.length,
        overdue: u.taskAssignments.filter(
          (a) => a.task.dueDate && a.task.dueDate < today,
        ).length,
        inReview: u.taskAssignments.filter((a) => a.task.status === "IN_REVIEW").length,
      })).filter((u) => u.open > 0),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/dashboard/v3");
  }
}
