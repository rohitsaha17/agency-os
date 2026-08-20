import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

/**
 * GET /api/reports/v3?report=&format=csv
 *
 * The report matrix from docs/V3_CONTEXT.md §8:
 *   delivery    quota vs posted per client/project/cycle   — reports.delivery
 *   deadline    what was missed or late, and by whom       — reports.delivery
 *   workload    open and submitted per person              — reports.delivery
 *   cycles      cycle-close history                        — reports.delivery
 *   financial   revenue, invoiced vs collected, margin     — reports.all
 *
 * An SMM holds reports.delivery but only for their own projects, so every
 * query is scoped by what they can see rather than filtered afterwards.
 */

type Row = Record<string, string | number | null>;

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    // Quote anything that could break a cell; double up embedded quotes.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const report = req.nextUrl.searchParams.get("report") ?? "delivery";
    const format = req.nextUrl.searchParams.get("format");

    if (!can(user, "reports.delivery")) {
      throw new ApiError("Reports aren't part of your access", 403);
    }
    if (report === "financial" && !can(user, "reports.all")) {
      throw new ApiError("Only an admin can see revenue and margin", 403);
    }

    const orgId = user.organizationId;
    // An SMM sees their own projects; manager and above see everything.
    const scoped = !can(user, "clients.manage");
    const projectScope = scoped
      ? { members: { some: { userId: user.id, role: "SMM" as const } } }
      : {};

    let rows: Row[] = [];

    if (report === "delivery") {
      const cycles = await prisma.projectCycle.findMany({
        where: { project: { organizationId: orgId, ...projectScope } },
        select: {
          label: true, status: true,
          project: {
            select: {
              name: true,
              client: { select: { name: true } },
              deliverables: { select: { qtyPerCycle: true } },
            },
          },
          contentItems: { select: { status: true, isExtra: true } },
        },
        orderBy: [{ startDate: "desc" }],
        take: 200,
      });
      rows = cycles.map((c) => {
        const quota = c.project.deliverables.reduce((s, d) => s + d.qtyPerCycle, 0);
        const posted = c.contentItems.filter((i) => i.status === "POSTED").length;
        const missed = c.contentItems.filter((i) => i.status === "MISSED").length;
        const carried = c.contentItems.filter((i) => i.status === "CARRIED_FORWARD").length;
        return {
          Client: c.project.client.name,
          Project: c.project.name,
          Cycle: c.label,
          Status: c.status,
          Quota: quota,
          Posted: posted,
          Missed: missed,
          Carried: carried,
          Extra: c.contentItems.filter((i) => i.isExtra).length,
          Fulfilment: quota > 0 ? `${Math.round((posted / quota) * 100)}%` : "—",
        };
      });
    }

    if (report === "deadline") {
      const today = new Date(new Date().toDateString());
      const late = await prisma.task.findMany({
        where: {
          organizationId: orgId, deletedAt: null,
          dueDate: { lt: today },
          status: { not: "DONE" },
          ...(scoped ? { project: projectScope } : {}),
        },
        select: {
          title: true, dueDate: true, status: true, kind: true,
          client: { select: { name: true } },
          project: { select: { name: true } },
          assignees: { select: { user: { select: { name: true } } } },
        },
        orderBy: { dueDate: "asc" },
        take: 300,
      });
      rows = late.map((t) => ({
        Task: t.title,
        Client: t.client?.name ?? "—",
        Project: t.project?.name ?? "—",
        Assignee: t.assignees.map((a) => a.user.name).join(", ") || "Unassigned",
        Kind: t.kind,
        Status: t.status,
        Due: t.dueDate?.toISOString().slice(0, 10) ?? "—",
        DaysLate: t.dueDate
          ? Math.floor((today.getTime() - t.dueDate.getTime()) / 86400000)
          : 0,
      }));
    }

    if (report === "workload") {
      const people = await prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          name: true, role: true,
          jobTitle: { select: { name: true } },
          taskAssignments: {
            where: { task: { deletedAt: null } },
            select: { task: { select: { status: true, dueDate: true } } },
          },
        },
        orderBy: { name: "asc" },
      });
      const today = new Date(new Date().toDateString());
      rows = people.map((p) => {
        const tasks = p.taskAssignments.map((a) => a.task);
        return {
          Person: p.name,
          Role: p.role,
          Designation: p.jobTitle?.name ?? "—",
          Open: tasks.filter((t) => t.status !== "DONE").length,
          Submitted: tasks.filter((t) => t.status === "IN_REVIEW").length,
          ChangesRequested: tasks.filter((t) => t.status === "CHANGES_REQUESTED").length,
          Overdue: tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < today).length,
          Done: tasks.filter((t) => t.status === "DONE").length,
        };
      });
    }

    if (report === "cycles") {
      const closed = await prisma.projectCycle.findMany({
        where: { status: "CLOSED", project: { organizationId: orgId, ...projectScope } },
        select: {
          label: true, closedAt: true, invoiceId: true,
          project: { select: { name: true, client: { select: { name: true } } } },
          closedBy: { select: { name: true } },
          contentItems: { select: { status: true } },
          billableItems: { select: { kind: true, status: true } },
        },
        orderBy: { closedAt: "desc" },
        take: 200,
      });
      rows = closed.map((c) => ({
        Client: c.project.client.name,
        Project: c.project.name,
        Cycle: c.label,
        ClosedOn: c.closedAt?.toISOString().slice(0, 10) ?? "—",
        ClosedBy: c.closedBy?.name ?? "—",
        Posted: c.contentItems.filter((i) => i.status === "POSTED").length,
        Carried: c.contentItems.filter((i) => i.status === "CARRIED_FORWARD").length,
        Extras: c.billableItems.filter((b) => b.kind === "EXTRA").length,
        Complimentary: c.billableItems.filter((b) => b.kind === "COMPLIMENTARY").length,
        Invoiced: c.invoiceId ? "yes" : "no",
      }));
    }

    if (report === "financial") {
      const clients = await prisma.client.findMany({
        where: { organizationId: orgId },
        select: {
          name: true, currency: true,
          invoices: {
            where: { status: { notIn: ["CANCELLED"] } },
            select: {
              discountPct: true, taxPct: true,
              lineItems: { select: { quantity: true, unitPrice: true } },
            },
          },
          receipts: { select: { amount: true } },
          expenses: {
            where: { status: { in: ["APPROVED", "PAID"] } },
            select: { amount: true },
          },
        },
        orderBy: { name: "asc" },
      });
      rows = clients.map((c) => {
        const invoiced = c.invoices.reduce((s, inv) => {
          const sub = inv.lineItems.reduce((x, li) => x + Number(li.quantity) * Number(li.unitPrice), 0);
          const disc = sub * (Number(inv.discountPct ?? 0) / 100);
          return s + (sub - disc) * (1 + Number(inv.taxPct ?? 0) / 100);
        }, 0);
        const collected = c.receipts.reduce((s, r) => s + Number(r.amount), 0);
        const spent = c.expenses.reduce((s, e) => s + Number(e.amount), 0);
        return {
          Client: c.name,
          Currency: c.currency ?? "—",
          Invoiced: Math.round(invoiced),
          Collected: Math.round(collected),
          Outstanding: Math.round(Math.max(0, invoiced - collected)),
          Expenses: Math.round(spent),
          Margin: Math.round(collected - spent),
        };
      });
    }

    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${report}-report.csv"`,
        },
      });
    }

    // jsonFor is a no-op for anyone allowed here, but keeps the habit: a
    // report payload should never be the one place money slips out.
    //
    // Only the project-shaped reports are actually narrowed for an SMM —
    // team workload is the whole team either way, so saying "your projects
    // only" there would be a lie.
    const projectScoped = ["delivery", "deadline", "cycles"].includes(report);
    return jsonFor(user, { report, rows, scoped: scoped && projectScoped });
  } catch (error) {
    return handleApiError(error, "GET /api/reports/v3");
  }
}
