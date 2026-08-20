import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

/**
 * GET /api/dashboard/v3 — the blocks THIS user's dashboard should show.
 *
 * One endpoint, capability-driven blocks (docs/V3_CONTEXT.md §8). Each role
 * lands somewhere useful rather than on the same page with things greyed
 * out, and money simply isn't computed for anyone without financials.view —
 * jsonFor strips it on the way out as a second layer.
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

    // ── Everyone: their own work ──
    const [myOpen, myOverdue, myChangesRequested, myPostDue] = await Promise.all([
      prisma.task.count({
        where: {
          organizationId: orgId, deletedAt: null,
          status: { notIn: ["DONE"] },
          assignees: { some: { userId: user.id } },
        },
      }),
      prisma.task.findMany({
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
      prisma.task.findMany({
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
      prisma.task.findMany({
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
    ]);

    // ── Reviewers: what's waiting on them ──
    const awaitingMyReview = reviews
      ? await prisma.task.count({
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
      : 0;

    // ── Planners: their projects and how each cycle is going ──
    const myProjects = plans
      ? await prisma.project.findMany({
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
      : [];

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

    // ── Cycles closing soon: worth a nudge before the month ends ──
    const closingSoon = plans
      ? await prisma.projectCycle.findMany({
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
      : [];

    // ── Money: only computed at all for those allowed to see it ──
    let money: Record<string, unknown> | null = null;
    if (seesMoney) {
      const [invoices, receipts, expenses, needsPricing, overdueOrg] = await Promise.all([
        prisma.invoice.findMany({
          where: { organizationId: orgId, status: { notIn: ["CANCELLED"] } },
          select: {
            status: true, discountPct: true, taxPct: true,
            lineItems: { select: { quantity: true, unitPrice: true } },
          },
        }),
        prisma.receipt.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } }),
        prisma.expense.aggregate({
          where: { organizationId: orgId, status: { in: ["APPROVED", "PAID"] } },
          _sum: { amount: true },
        }),
        prisma.billableItem.count({
          where: { organizationId: orgId, status: "PENDING_PRICING" },
        }),
        prisma.task.count({
          where: {
            organizationId: orgId, deletedAt: null,
            status: { not: "DONE" }, dueDate: { lt: today },
          },
        }),
      ]);

      const lineTotal = (inv: (typeof invoices)[number]) => {
        const sub = inv.lineItems.reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0);
        const disc = sub * (Number(inv.discountPct ?? 0) / 100);
        return (sub - disc) * (1 + Number(inv.taxPct ?? 0) / 100);
      };
      const invoiced = invoices.reduce((s, i) => s + lineTotal(i), 0);
      const collected = Number(receipts._sum.amount ?? 0);

      money = {
        invoiced,
        collected,
        outstanding: Math.max(0, invoiced - collected),
        expenses: Number(expenses._sum.amount ?? 0),
        needsPricing,
        overdueAcrossOrg: overdueOrg,
      };
    }

    // ── Team workload: who's carrying what (managers and above) ──
    const workload = managesClients
      ? await prisma.user.findMany({
          where: { organizationId: orgId, isActive: true },
          select: {
            id: true, name: true,
            jobTitle: { select: { name: true } },
            taskAssignments: {
              where: { task: { deletedAt: null, status: { notIn: ["DONE"] } } },
              select: { task: { select: { id: true, status: true, dueDate: true } } },
            },
          },
        })
      : [];

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
