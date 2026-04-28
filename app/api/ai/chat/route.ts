import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getRateLimitKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface ChatRequest {
  message: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  context?: {
    currentPage?: string;
    userId?: string;
    userName?: string;
  };
}

interface ActionItem {
  type: "navigate" | "create" | "search";
  label: string;
  data: Record<string, unknown>;
}

interface DataCard {
  type: "stat" | "list" | "table";
  title: string;
  data: unknown;
}

interface ChatResponse {
  response: string;
  actions?: ActionItem[];
  dataCards?: DataCard[];
}

// ────────────────────────────────────────────────────────────────
// Keyword detection — decides which data to fetch
// ────────────────────────────────────────────────────────────────

type TopicKey =
  | "tasks"
  | "projects"
  | "clients"
  | "expenses"
  | "invoices"
  | "quotations"
  | "files"
  | "team"
  | "contracts"
  | "dashboard";

const TOPIC_PATTERNS: Record<TopicKey, RegExp> = {
  tasks: /\b(task|tasks|todo|to-do|overdue|deadline|blocked|assign|subtask|in.?progress|in.?review)\b/i,
  projects: /\b(project|projects|retainer|one.?time|active project|project status|engagement)\b/i,
  clients: /\b(client|clients|customer|customers|company|companies|prospect|account)\b/i,
  expenses: /\b(expense|expenses|spending|cost|costs|budget|reimburs|vendor payment|freelancer payment)\b/i,
  invoices: /\b(invoice|invoices|billing|payment|paid|unpaid|overdue invoice|outstanding)\b/i,
  quotations: /\b(quotation|quotations|quote|quotes|proposal|estimate|pricing)\b/i,
  files: /\b(file|files|asset|assets|upload|document|attachment|version)\b/i,
  team: /\b(team|member|members|user|users|who|staff|employee)\b/i,
  contracts: /\b(contract|contracts|nda|agreement|signed|signature)\b/i,
  dashboard: /\b(dashboard|overview|summary|stats|statistics|how are we doing|status report|health)\b/i,
};

function detectTopics(message: string): TopicKey[] {
  const topics: TopicKey[] = [];
  for (const [key, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (pattern.test(message)) topics.push(key as TopicKey);
  }
  // If nothing matched, include dashboard for general questions
  if (topics.length === 0) topics.push("dashboard");
  return topics;
}

// ────────────────────────────────────────────────────────────────
// Database context fetchers — one per topic
// ────────────────────────────────────────────────────────────────

const now = () => new Date();
const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

async function fetchTaskContext() {
  const t = today();
  const [statusCounts, overdueTasks, recentDone, blockedTasks, upcomingTasks] =
    await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      prisma.task.findMany({
        where: {
          dueDate: { lt: t },
          status: { notIn: ["DONE"] },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          status: true,
          project: { select: { id: true, name: true } },
          assignees: {
            select: { user: { select: { name: true } } },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),
      prisma.task.findMany({
        where: { status: "DONE", deletedAt: null },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          project: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.task.findMany({
        where: { status: "BLOCKED", deletedAt: null },
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
          assignees: {
            select: { user: { select: { name: true } } },
          },
        },
        take: 10,
      }),
      prisma.task.findMany({
        where: {
          dueDate: { gte: t, lte: new Date(t.getTime() + 7 * 86400000) },
          status: { notIn: ["DONE"] },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          status: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
    ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );
  const total = Object.values(statusMap).reduce((s, v) => s + (v as number), 0);

  return {
    topic: "tasks",
    summary: {
      total,
      todo: statusMap["TODO"] ?? 0,
      inProgress: statusMap["IN_PROGRESS"] ?? 0,
      inReview: statusMap["IN_REVIEW"] ?? 0,
      done: statusMap["DONE"] ?? 0,
      blocked: statusMap["BLOCKED"] ?? 0,
      overdueCount: overdueTasks.length,
    },
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      project: t.project?.name,
      projectId: t.project?.id,
      assignees: t.assignees.map((a) => a.user.name),
    })),
    blockedTasks: blockedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project?.name,
      projectId: t.project?.id,
      assignees: t.assignees.map((a) => a.user.name),
    })),
    upcomingTasks: upcomingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      project: t.project?.name,
      projectId: t.project?.id,
    })),
    recentlyCompleted: recentDone.map((t) => ({
      title: t.title,
      completedAt: t.updatedAt,
      project: t.project?.name,
    })),
  };
}

async function fetchProjectContext() {
  const [statusCounts, activeProjects] = await Promise.all([
    prisma.project.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] } },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        startDate: true,
        endDate: true,
        budget: true,
        currency: true,
        client: { select: { id: true, name: true } },
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );

  return {
    topic: "projects",
    summary: {
      active: statusMap["ACTIVE"] ?? 0,
      draft: statusMap["DRAFT"] ?? 0,
      onHold: statusMap["ON_HOLD"] ?? 0,
      completed: statusMap["COMPLETED"] ?? 0,
      cancelled: statusMap["CANCELLED"] ?? 0,
      total: Object.values(statusMap).reduce((s, v) => s + (v as number), 0),
    },
    projects: activeProjects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      type: p.type,
      client: p.client.name,
      clientId: p.client.id,
      startDate: p.startDate,
      endDate: p.endDate,
      budget: p.budget ? Number(p.budget) : null,
      currency: p.currency,
      taskCount: p._count.tasks,
    })),
  };
}

async function fetchClientContext() {
  const [statusCounts, clients] = await Promise.all([
    prisma.client.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.client.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      select: {
        id: true,
        name: true,
        companyName: true,
        status: true,
        industry: true,
        email: true,
        _count: {
          select: {
            projects: true,
            invoices: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );

  return {
    topic: "clients",
    summary: {
      active: statusMap["ACTIVE"] ?? 0,
      prospect: statusMap["PROSPECT"] ?? 0,
      inactive: statusMap["INACTIVE"] ?? 0,
      archived: statusMap["ARCHIVED"] ?? 0,
      total: Object.values(statusMap).reduce((s, v) => s + (v as number), 0),
    },
    clients: clients.map((c) => ({
      id: c.id,
      name: c.companyName || c.name,
      contactName: c.name,
      status: c.status,
      industry: c.industry,
      email: c.email,
      projectCount: c._count.projects,
      invoiceCount: c._count.invoices,
    })),
  };
}

async function fetchExpenseContext() {
  const ms = monthStart();
  const [categoryCounts, totalThisMonth, pendingCount, recentExpenses] =
    await Promise.all([
      prisma.expense.groupBy({
        by: ["category"],
        where: { status: { not: "REJECTED" } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: {
          status: { not: "REJECTED" },
          date: { gte: ms },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.count({ where: { status: "PENDING" } }),
      prisma.expense.findMany({
        select: {
          id: true,
          title: true,
          amount: true,
          currency: true,
          category: true,
          status: true,
          date: true,
          project: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: 10,
      }),
    ]);

  return {
    topic: "expenses",
    summary: {
      totalThisMonth: Number(totalThisMonth._sum.amount ?? 0),
      countThisMonth: totalThisMonth._count.id,
      pendingApproval: pendingCount,
    },
    byCategory: categoryCounts.map((c) => ({
      category: c.category,
      total: Number(c._sum.amount ?? 0),
      count: c._count.id,
    })),
    recentExpenses: recentExpenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      currency: e.currency,
      category: e.category,
      status: e.status,
      date: e.date,
      project: e.project?.name ?? null,
    })),
  };
}

async function fetchInvoiceContext() {
  const [statusCounts, recentInvoices, totalsByStatus] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.invoice.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        dueDate: true,
        currency: true,
        client: { select: { id: true, name: true } },
        project: { select: { name: true } },
        lineItems: {
          select: { quantity: true, unitPrice: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );

  const invoicesWithTotals = recentInvoices.map((inv) => {
    const subtotal = inv.lineItems.reduce(
      (sum, li) => sum + Number(li.quantity) * Number(li.unitPrice),
      0
    );
    return {
      id: inv.id,
      number: inv.invoiceNumber,
      status: inv.status,
      dueDate: inv.dueDate,
      currency: inv.currency,
      client: inv.client.name,
      clientId: inv.client.id,
      project: inv.project?.name ?? null,
      total: subtotal,
    };
  });

  return {
    topic: "invoices",
    summary: {
      draft: statusMap["DRAFT"] ?? 0,
      sent: statusMap["SENT"] ?? 0,
      paid: statusMap["PAID"] ?? 0,
      overdue: statusMap["OVERDUE"] ?? 0,
      cancelled: statusMap["CANCELLED"] ?? 0,
      total: Object.values(statusMap).reduce((s, v) => s + (v as number), 0),
    },
    invoices: invoicesWithTotals,
  };
}

async function fetchQuotationContext() {
  const [statusCounts, recentQuotations] = await Promise.all([
    prisma.quotation.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { total: true },
    }),
    prisma.quotation.findMany({
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        total: true,
        currency: true,
        validUntil: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const summary: Record<string, { count: number; value: number }> = {};
  for (const g of statusCounts) {
    summary[g.status] = {
      count: g._count.id,
      value: Number(g._sum.total ?? 0),
    };
  }

  return {
    topic: "quotations",
    summary,
    pipelineValue: statusCounts
      .filter((g) => ["DRAFT", "SENT", "APPROVED"].includes(g.status))
      .reduce((s, g) => s + Number(g._sum.total ?? 0), 0),
    quotations: recentQuotations.map((q) => ({
      id: q.id,
      number: q.number,
      title: q.title,
      status: q.status,
      total: Number(q.total),
      currency: q.currency,
      validUntil: q.validUntil,
      client: q.client.name,
      clientId: q.client.id,
    })),
  };
}

async function fetchFileContext() {
  const [statusCounts, recentFiles] = await Promise.all([
    prisma.file.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.file.findMany({
      select: {
        id: true,
        name: true,
        mimeCategory: true,
        status: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );

  return {
    topic: "files",
    summary: {
      total: Object.values(statusMap).reduce((s, v) => s + (v as number), 0),
      draft: statusMap["DRAFT"] ?? 0,
      inReview: statusMap["IN_REVIEW"] ?? 0,
      approved: statusMap["APPROVED"] ?? 0,
      changesRequired: statusMap["CHANGES_REQUIRED"] ?? 0,
    },
    recentFiles: recentFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.mimeCategory,
      status: f.status,
      createdAt: f.createdAt,
      project: f.project?.name ?? null,
      client: f.client?.name ?? null,
    })),
  };
}

async function fetchTeamContext() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      _count: {
        select: {
          taskAssignments: true,
          managedTasks: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    topic: "team",
    totalMembers: users.length,
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      assignedTasks: u._count.taskAssignments,
      managedTasks: u._count.managedTasks,
    })),
  };
}

async function fetchContractContext() {
  const [statusCounts, recentContracts] = await Promise.all([
    prisma.contract.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.contract.findMany({
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        value: true,
        currency: true,
        client: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((g) => [g.status, g._count.id])
  );

  return {
    topic: "contracts",
    summary: {
      draft: statusMap["DRAFT"] ?? 0,
      sent: statusMap["SENT"] ?? 0,
      partiallySigned: statusMap["PARTIALLY_SIGNED"] ?? 0,
      fullySigned: statusMap["FULLY_SIGNED"] ?? 0,
      expired: statusMap["EXPIRED"] ?? 0,
      terminated: statusMap["TERMINATED"] ?? 0,
    },
    contracts: recentContracts.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
      value: c.value ? Number(c.value) : null,
      currency: c.currency,
      client: c.client?.name ?? null,
      project: c.project?.name ?? null,
    })),
  };
}

async function fetchDashboardContext() {
  const t = today();
  const ms = monthStart();

  const [
    projectStatusCounts,
    taskStatusCounts,
    activeClients,
    quotationPipeline,
    overdueTaskCount,
    expenseThisMonth,
  ] = await Promise.all([
    prisma.project.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.task.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { id: true },
    }),
    prisma.client.count({ where: { status: "ACTIVE" } }),
    prisma.quotation.aggregate({
      where: { status: { in: ["DRAFT", "SENT", "APPROVED"] } },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.task.count({
      where: {
        dueDate: { lt: t },
        status: { notIn: ["DONE"] },
        deletedAt: null,
      },
    }),
    prisma.expense.aggregate({
      where: { status: { not: "REJECTED" }, date: { gte: ms } },
      _sum: { amount: true },
    }),
  ]);

  const projectMap = Object.fromEntries(
    projectStatusCounts.map((g) => [g.status, g._count.id])
  );
  const taskMap = Object.fromEntries(
    taskStatusCounts.map((g) => [g.status, g._count.id])
  );

  return {
    topic: "dashboard",
    projects: {
      active: projectMap["ACTIVE"] ?? 0,
      draft: projectMap["DRAFT"] ?? 0,
      onHold: projectMap["ON_HOLD"] ?? 0,
      completed: projectMap["COMPLETED"] ?? 0,
      total: Object.values(projectMap).reduce((s, v) => s + (v as number), 0),
    },
    tasks: {
      todo: taskMap["TODO"] ?? 0,
      inProgress: taskMap["IN_PROGRESS"] ?? 0,
      inReview: taskMap["IN_REVIEW"] ?? 0,
      done: taskMap["DONE"] ?? 0,
      blocked: taskMap["BLOCKED"] ?? 0,
      total: Object.values(taskMap).reduce((s, v) => s + (v as number), 0),
      overdue: overdueTaskCount,
    },
    activeClients,
    pipelineValue: Number(quotationPipeline._sum.total ?? 0),
    openQuotations: quotationPipeline._count.id,
    expensesThisMonth: Number(expenseThisMonth._sum.amount ?? 0),
  };
}

// Topic → fetcher map
const TOPIC_FETCHERS: Record<TopicKey, () => Promise<unknown>> = {
  tasks: fetchTaskContext,
  projects: fetchProjectContext,
  clients: fetchClientContext,
  expenses: fetchExpenseContext,
  invoices: fetchInvoiceContext,
  quotations: fetchQuotationContext,
  files: fetchFileContext,
  team: fetchTeamContext,
  contracts: fetchContractContext,
  dashboard: fetchDashboardContext,
};

// ────────────────────────────────────────────────────────────────
// Smart search — cross-entity text search
// ────────────────────────────────────────────────────────────────

async function smartSearch(query: string) {
  // Extract potential search terms (strip common filler words)
  const cleaned = query
    .replace(
      /\b(find|search|show|me|all|the|a|an|for|with|named|called|about|where|is|are|that|has|have|look|looking|get|list)\b/gi,
      ""
    )
    .trim();

  if (!cleaned || cleaned.length < 2) return null;

  const searchTerm = cleaned;

  const [projects, clients, tasks, files, quotations, invoices] =
    await Promise.all([
      prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { description: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          client: { select: { name: true } },
        },
        take: 5,
      }),
      prisma.client.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { companyName: { contains: searchTerm, mode: "insensitive" } },
            { industry: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          companyName: true,
          status: true,
        },
        take: 5,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: searchTerm, mode: "insensitive" } },
            { description: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          project: { select: { id: true, name: true } },
        },
        take: 5,
      }),
      prisma.file.findMany({
        where: {
          name: { contains: searchTerm, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          mimeCategory: true,
          project: { select: { name: true } },
        },
        take: 5,
      }),
      prisma.quotation.findMany({
        where: {
          OR: [
            { title: { contains: searchTerm, mode: "insensitive" } },
            { number: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          number: true,
          status: true,
          total: true,
          currency: true,
          client: { select: { name: true } },
        },
        take: 5,
      }),
      prisma.invoice.findMany({
        where: {
          OR: [
            { invoiceNumber: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          client: { select: { name: true } },
        },
        take: 5,
      }),
    ]);

  const totalResults =
    projects.length +
    clients.length +
    tasks.length +
    files.length +
    quotations.length +
    invoices.length;

  if (totalResults === 0) return null;

  return {
    searchTerm,
    results: {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        client: p.client.name,
      })),
      clients: clients.map((c) => ({
        id: c.id,
        name: c.companyName || c.name,
        status: c.status,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        project: t.project.name,
        projectId: t.project.id,
      })),
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.mimeCategory,
        project: f.project?.name ?? null,
      })),
      quotations: quotations.map((q) => ({
        id: q.id,
        title: q.title,
        number: q.number,
        status: q.status,
        total: Number(q.total),
        currency: q.currency,
        client: q.client.name,
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.invoiceNumber,
        status: inv.status,
        client: inv.client.name,
      })),
    },
    totalResults,
  };
}

// ────────────────────────────────────────────────────────────────
// System prompt builder
// ────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  context: Record<string, unknown>,
  userContext?: ChatRequest["context"]
): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are the AI assistant for an agency management platform called "Agency OS". You help agency team members understand their data, find information, and take actions within the platform.

Current date: ${currentDate}
${userContext?.userName ? `Current user: ${userContext.userName}` : ""}
${userContext?.currentPage ? `User is currently viewing: ${userContext.currentPage}` : ""}

## Your capabilities:
1. **Answer questions** about the agency's projects, tasks, clients, finances, files, team, and contracts using the data provided below.
2. **Smart search** — find specific items across the platform (clients, projects, tasks, files, quotations, invoices).
3. **Suggest actions** — when appropriate, suggest navigation actions (going to specific pages), creation actions (creating new items), or search actions.
4. **Provide insights** — analyze the data to spot trends, overdue items, blockers, and give recommendations.

## Response format:
- Use markdown for formatting. Use bullet points and bold text for clarity.
- Be concise but thorough. Agency people are busy.
- When listing items, include relevant identifiers so the user can act on them.
- When you reference specific entities (projects, clients, tasks), suggest navigation actions.
- For questions about counts or stats, provide exact numbers from the data.
- If you don't have enough data to answer, say so honestly and suggest how to get the information.

## Action suggestions:
When your response references specific entities, include suggested actions the user can take. Format them as JSON in a special block at the END of your text response:

\`\`\`actions
[
  {"type": "navigate", "label": "Go to Projects", "data": {"href": "/projects"}},
  {"type": "navigate", "label": "View Client: Acme", "data": {"href": "/clients/client_id_here"}},
  {"type": "create", "label": "Create New Task", "data": {"entity": "task", "defaults": {"title": "...", "projectId": "..."}}},
  {"type": "search", "label": "Search for X", "data": {"query": "search term"}}
]
\`\`\`

## Data cards:
When presenting structured data (stats, lists, tables), include them as a JSON block so the UI can render them nicely:

\`\`\`datacards
[
  {"type": "stat", "title": "Active Projects", "data": {"value": 5, "change": "+2 this month"}},
  {"type": "list", "title": "Overdue Tasks", "data": {"items": [{"label": "Task name", "sublabel": "Project name", "status": "OVERDUE"}]}},
  {"type": "table", "title": "Project Summary", "data": {"headers": ["Name", "Status", "Client"], "rows": [["Web Redesign", "ACTIVE", "Acme"]]}}
]
\`\`\`

## Platform data context:
${JSON.stringify(context, null, 2)}

Answer the user's question based on the data above. Be accurate with numbers — count from the data provided.`;
}

// ────────────────────────────────────────────────────────────────
// Response parser — extract actions and data cards from AI text
// ────────────────────────────────────────────────────────────────

function parseAIResponse(text: string): ChatResponse {
  let response = text;
  let actions: ActionItem[] | undefined;
  let dataCards: DataCard[] | undefined;

  // Extract actions block
  const actionsMatch = response.match(
    /```actions\s*\n([\s\S]*?)\n```/
  );
  if (actionsMatch) {
    try {
      actions = JSON.parse(actionsMatch[1]);
      response = response.replace(actionsMatch[0], "").trim();
    } catch {
      // Invalid JSON — ignore
    }
  }

  // Extract datacards block
  const dataCardsMatch = response.match(
    /```datacards\s*\n([\s\S]*?)\n```/
  );
  if (dataCardsMatch) {
    try {
      dataCards = JSON.parse(dataCardsMatch[1]);
      response = response.replace(dataCardsMatch[0], "").trim();
    } catch {
      // Invalid JSON — ignore
    }
  }

  return { response, actions, dataCards };
}

// ────────────────────────────────────────────────────────────────
// Fallback handler — no API key, use pattern matching
// ────────────────────────────────────────────────────────────────

async function handleFallback(
  message: string,
  topics: TopicKey[]
): Promise<ChatResponse> {
  const lowerMsg = message.toLowerCase();

  // Fetch context for detected topics
  const contextData: Record<string, unknown> = {};
  for (const topic of topics) {
    try {
      contextData[topic] = await TOPIC_FETCHERS[topic]();
    } catch {
      // Skip failed fetchers
    }
  }

  // Check for search intent
  const isSearchQuery =
    /\b(find|search|look for|where is|show me|looking for)\b/i.test(message);
  if (isSearchQuery) {
    const searchResults = await smartSearch(message);
    if (searchResults) {
      return formatSearchResults(searchResults);
    }
  }

  // Handle specific question patterns
  if (/how many.*active.*project/i.test(lowerMsg)) {
    const data = contextData.projects as Awaited<
      ReturnType<typeof fetchProjectContext>
    >;
    if (data) {
      return {
        response: `There are currently **${data.summary.active} active projects**. In total, there are ${data.summary.total} projects across all statuses.`,
        dataCards: [
          {
            type: "stat",
            title: "Project Overview",
            data: data.summary,
          },
        ],
        actions: [
          {
            type: "navigate",
            label: "View All Projects",
            data: { href: "/projects" },
          },
        ],
      };
    }
  }

  if (/overdue.*task|task.*overdue/i.test(lowerMsg)) {
    const data = contextData.tasks as Awaited<
      ReturnType<typeof fetchTaskContext>
    >;
    if (data) {
      const overdueList = data.overdueTasks.map(
        (t) =>
          `- **${t.title}** (${t.priority}) — ${t.project ?? "No project"}, due ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "unknown"}`
      );
      return {
        response:
          data.overdueTasks.length > 0
            ? `There are **${data.summary.overdueCount} overdue tasks**:\n\n${overdueList.join("\n")}`
            : "Great news! There are **no overdue tasks** right now.",
        dataCards:
          data.overdueTasks.length > 0
            ? [
                {
                  type: "list",
                  title: "Overdue Tasks",
                  data: {
                    items: data.overdueTasks.map((t) => ({
                      label: t.title,
                      sublabel: `${t.project ?? "No project"} | ${t.priority}`,
                      status: "OVERDUE",
                      id: t.id,
                      projectId: t.projectId,
                    })),
                  },
                },
              ]
            : undefined,
        actions: [
          {
            type: "navigate",
            label: "View Tasks",
            data: { href: "/tasks" },
          },
        ],
      };
    }
  }

  if (/blocked.*task|task.*blocked/i.test(lowerMsg)) {
    const data = contextData.tasks as Awaited<
      ReturnType<typeof fetchTaskContext>
    >;
    if (data && data.blockedTasks.length > 0) {
      const blockedList = data.blockedTasks.map(
        (t) =>
          `- **${t.title}** — ${t.project ?? "No project"} (assigned: ${t.assignees.join(", ") || "unassigned"})`
      );
      return {
        response: `There are **${data.summary.blocked} blocked tasks**:\n\n${blockedList.join("\n")}`,
        dataCards: [
          {
            type: "list",
            title: "Blocked Tasks",
            data: {
              items: data.blockedTasks.map((t) => ({
                label: t.title,
                sublabel: t.project ?? "No project",
                status: "BLOCKED",
              })),
            },
          },
        ],
        actions: [
          {
            type: "navigate",
            label: "View Tasks",
            data: { href: "/tasks" },
          },
        ],
      };
    }
  }

  if (/how many.*client|client.*count|active.*client/i.test(lowerMsg)) {
    const data = contextData.clients as Awaited<
      ReturnType<typeof fetchClientContext>
    >;
    if (data) {
      return {
        response: `You have **${data.summary.active} active clients** and **${data.summary.prospect} prospects**. Total clients: ${data.summary.total}.`,
        dataCards: [
          { type: "stat", title: "Client Overview", data: data.summary },
        ],
        actions: [
          {
            type: "navigate",
            label: "View Clients",
            data: { href: "/clients" },
          },
        ],
      };
    }
  }

  if (/expense|spending|budget/i.test(lowerMsg)) {
    const data = contextData.expenses as Awaited<
      ReturnType<typeof fetchExpenseContext>
    >;
    if (data) {
      return {
        response: `**Expenses this month:** ${data.summary.totalThisMonth.toLocaleString("en-US", { style: "currency", currency: "USD" })} across ${data.summary.countThisMonth} entries. There are **${data.summary.pendingApproval} expenses pending approval**.`,
        dataCards: [
          { type: "stat", title: "Expense Summary", data: data.summary },
          {
            type: "list",
            title: "Recent Expenses",
            data: {
              items: data.recentExpenses.slice(0, 5).map((e) => ({
                label: e.title,
                sublabel: `${e.currency} ${e.amount.toLocaleString()} | ${e.category}`,
                status: e.status,
              })),
            },
          },
        ],
        actions: [
          {
            type: "navigate",
            label: "View Expenses",
            data: { href: "/expenses" },
          },
        ],
      };
    }
  }

  if (/invoice|billing|payment/i.test(lowerMsg)) {
    const data = contextData.invoices as Awaited<
      ReturnType<typeof fetchInvoiceContext>
    >;
    if (data) {
      return {
        response: `**Invoice summary:** ${data.summary.sent} sent, ${data.summary.paid} paid, ${data.summary.overdue} overdue. Total invoices: ${data.summary.total}.`,
        dataCards: [
          { type: "stat", title: "Invoice Overview", data: data.summary },
        ],
        actions: [
          {
            type: "navigate",
            label: "View Invoices",
            data: { href: "/invoices" },
          },
        ],
      };
    }
  }

  if (/quotation|quote|proposal/i.test(lowerMsg)) {
    const data = contextData.quotations as Awaited<
      ReturnType<typeof fetchQuotationContext>
    >;
    if (data) {
      return {
        response: `**Pipeline value:** ${data.pipelineValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}. You have ${data.quotations.length} recent quotations.`,
        dataCards: [
          {
            type: "stat",
            title: "Quotation Pipeline",
            data: { pipelineValue: data.pipelineValue, ...data.summary },
          },
        ],
        actions: [
          {
            type: "navigate",
            label: "View Quotations",
            data: { href: "/quotations" },
          },
        ],
      };
    }
  }

  // Generic dashboard fallback
  const dashData = contextData.dashboard as Awaited<
    ReturnType<typeof fetchDashboardContext>
  >;
  if (dashData) {
    return {
      response: `Here's a quick overview:\n\n- **${dashData.projects.active} active projects** (${dashData.projects.total} total)\n- **${dashData.tasks.overdue} overdue tasks** out of ${dashData.tasks.total} total\n- **${dashData.activeClients} active clients**\n- **Pipeline:** ${dashData.pipelineValue.toLocaleString("en-US", { style: "currency", currency: "USD" })} across ${dashData.openQuotations} open quotations\n- **Expenses this month:** ${dashData.expensesThisMonth.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\nAsk me anything specific about your projects, tasks, clients, or finances!`,
      dataCards: [
        {
          type: "stat",
          title: "Quick Stats",
          data: {
            activeProjects: dashData.projects.active,
            overdueTasks: dashData.tasks.overdue,
            activeClients: dashData.activeClients,
            pipelineValue: dashData.pipelineValue,
          },
        },
      ],
      actions: [
        {
          type: "navigate",
          label: "Go to Dashboard",
          data: { href: "/" },
        },
        {
          type: "navigate",
          label: "View Tasks",
          data: { href: "/tasks" },
        },
        {
          type: "navigate",
          label: "View Projects",
          data: { href: "/projects" },
        },
      ],
    };
  }

  return {
    response:
      "I couldn't fetch the data needed to answer your question. Please try again or rephrase your question.",
  };
}

// Format search results into a ChatResponse
function formatSearchResults(searchData: NonNullable<Awaited<ReturnType<typeof smartSearch>>>): ChatResponse {
  const { results, totalResults, searchTerm } = searchData;
  const parts: string[] = [];
  const actions: ActionItem[] = [];

  parts.push(
    `Found **${totalResults} results** for "${searchTerm}":\n`
  );

  if (results.clients.length > 0) {
    parts.push("**Clients:**");
    for (const c of results.clients) {
      parts.push(`- ${c.name} (${c.status})`);
      actions.push({
        type: "navigate",
        label: `View ${c.name}`,
        data: { href: `/clients/${c.id}` },
      });
    }
    parts.push("");
  }

  if (results.projects.length > 0) {
    parts.push("**Projects:**");
    for (const p of results.projects) {
      parts.push(`- ${p.name} — ${p.client} (${p.status})`);
      actions.push({
        type: "navigate",
        label: `View ${p.name}`,
        data: { href: `/projects/${p.id}` },
      });
    }
    parts.push("");
  }

  if (results.tasks.length > 0) {
    parts.push("**Tasks:**");
    for (const t of results.tasks) {
      parts.push(
        `- ${t.title} — ${t.project} (${t.status}, ${t.priority})`
      );
      actions.push({
        type: "navigate",
        label: `Go to ${t.project}`,
        data: { href: `/projects/${t.projectId}` },
      });
    }
    parts.push("");
  }

  if (results.files.length > 0) {
    parts.push("**Files:**");
    for (const f of results.files) {
      parts.push(
        `- ${f.name} (${f.type})${f.project ? ` — ${f.project}` : ""}`
      );
    }
    actions.push({
      type: "navigate",
      label: "View Files",
      data: { href: "/files" },
    });
    parts.push("");
  }

  if (results.quotations.length > 0) {
    parts.push("**Quotations:**");
    for (const q of results.quotations) {
      parts.push(
        `- ${q.number}: ${q.title} — ${q.client} (${q.status}, ${q.currency} ${q.total.toLocaleString()})`
      );
      actions.push({
        type: "navigate",
        label: `View ${q.number}`,
        data: { href: `/quotations/${q.id}` },
      });
    }
    parts.push("");
  }

  if (results.invoices.length > 0) {
    parts.push("**Invoices:**");
    for (const inv of results.invoices) {
      parts.push(`- ${inv.number} — ${inv.client} (${inv.status})`);
      actions.push({
        type: "navigate",
        label: `View ${inv.number}`,
        data: { href: `/invoices/${inv.id}` },
      });
    }
    parts.push("");
  }

  return {
    response: parts.join("\n"),
    actions: actions.slice(0, 8), // Limit to 8 action buttons
    dataCards:
      totalResults > 3
        ? [
            {
              type: "stat",
              title: "Search Results",
              data: {
                total: totalResults,
                clients: results.clients.length,
                projects: results.projects.length,
                tasks: results.tasks.length,
                files: results.files.length,
                quotations: results.quotations.length,
                invoices: results.invoices.length,
              },
            },
          ]
        : undefined,
  };
}

// ────────────────────────────────────────────────────────────────
// POST /api/ai/chat
// ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "ai-chat");
  const rl = rateLimit(rlKey, AI_RATE_LIMITS.chat);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: ChatRequest = await req.json();
    const { message, conversationHistory, context: userContext } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // ── 1. Detect relevant topics ──────────────────────────────
    const topics = detectTopics(message);

    // ── 2. Check for search intent and run smart search ────────
    const isSearchQuery =
      /\b(find|search|look for|where is|show me|looking for|locate)\b/i.test(
        message
      );
    let searchResults: Awaited<ReturnType<typeof smartSearch>> = null;
    if (isSearchQuery) {
      searchResults = await smartSearch(message);
    }

    // ── 3. Fetch context for detected topics (parallel) ────────
    const contextEntries = await Promise.all(
      topics.map(async (topic) => {
        try {
          const data = await TOPIC_FETCHERS[topic]();
          return [topic, data] as const;
        } catch (err) {
          console.error(`[AI Chat] Error fetching ${topic} context:`, err);
          return [topic, null] as const;
        }
      })
    );

    const contextData: Record<string, unknown> = {};
    for (const [topic, data] of contextEntries) {
      if (data) contextData[topic] = data;
    }

    // Add search results to context
    if (searchResults) {
      contextData.searchResults = searchResults;
    }

    // ── 4. Check for Anthropic API key ─────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Fallback mode — keyword-based responses with real data
      const fallbackResponse = await handleFallback(message, topics);
      return NextResponse.json(fallbackResponse);
    }

    // ── 5. Build conversation for Claude ───────────────────────
    const systemPrompt = buildSystemPrompt(contextData, userContext);

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    // Add conversation history (limit to last 20 messages for context window)
    const recentHistory = (conversationHistory || []).slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ── 6. Call Claude ─────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey });

    const aiMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const responseText = aiMessage.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // ── 7. Parse response for actions and data cards ───────────
    const parsed = parseAIResponse(responseText);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[POST /api/ai/chat]", err);

    // If it's an Anthropic API error, provide a friendlier message
    if (err instanceof Error && err.message.includes("authentication")) {
      return NextResponse.json(
        {
          response:
            "The AI service is not properly configured. Please check your API key settings.",
          actions: [
            {
              type: "navigate",
              label: "Go to Settings",
              data: { href: "/settings" },
            },
          ],
        },
        { status: 200 } // Return 200 with error message in response body
      );
    }

    return NextResponse.json(
      { error: "Failed to process your request. Please try again." },
      { status: 500 }
    );
  }
}
