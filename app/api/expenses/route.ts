import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor, requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { canViewFinancials } from "@/lib/permissions";

const expenseInclude = {
  project:     { select: { id: true, name: true, clientId: true } },
  client:      { select: { id: true, name: true, companyName: true } },
  user:        { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    // v3: juniors have neither expenses.create nor financials.view
    requireCapability(user, "expenses.create");
    const { searchParams } = new URL(req.url);
    const projectId     = searchParams.get("projectId");
    const clientId      = searchParams.get("clientId");
    const category      = searchParams.get("category");
    const status        = searchParams.get("status");
    const search        = searchParams.get("search");
    // When `clientId` is provided we want ALL expenses for that client —
    // either tagged directly OR tagged to a project that belongs to the client.
    // Opt-in via `?clientId=xxx&includeProjectExpenses=1`.
    const includeProjectExpenses = searchParams.get("includeProjectExpenses") === "1";

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      ...(projectId     ? { projectId }     : {}),
      ...(category ? { category: category as never } : {}),
      ...(status   ? { status:   status   as never } : {}),
      ...(search   ? { title: { contains: search, mode: "insensitive" } } : {}),
    };

    if (clientId) {
      if (includeProjectExpenses) {
        where.OR = [
          { clientId },
          { project: { clientId } },
        ];
      } else {
        where.clientId = clientId;
      }
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: expenseInclude,
    });

    // v2: amounts never reach MEMBER clients (server-side strip)
    if (!canViewFinancials(user)) {
      return jsonFor(user, expenses.map((e) => ({ ...e, amount: null })));
    }

    return jsonFor(user, expenses);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    // v3: juniors have neither expenses.create nor financials.view
    requireCapability(user, "expenses.create");
    const body = await req.json();
    const {
      title, description, category, amount, currency,
      date, status, projectId, clientId, userId,
      isReimbursable, receiptUrl, notes,
    } = body;

    if (!title?.trim()) throw new ApiError("Title is required", 400);
    if (!amount || isNaN(parseFloat(amount))) throw new ApiError("Valid amount is required", 400);

    // If linking to a project or client, confirm each is in the caller's org.
    if (projectId) {
      const p = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!p) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!c) throw new ApiError("Client not found", 404);
    }

    const expense = await prisma.expense.create({
      data: {
        organizationId: user.organizationId,
        title:          title.trim(),
        description:    description?.trim() || null,
        category:       category || "OTHER",
        amount:         parseFloat(amount),
        currency:       currency || "USD",
        date:           date ? new Date(date) : new Date(),
        status:         status || "PENDING",
        projectId:      projectId      || null,
        clientId:       clientId       || null,
        userId:         userId         || null,
        isReimbursable: !!isReimbursable,
        receiptUrl:     receiptUrl?.trim() || null,
        notes:          notes?.trim()  || null,
      },
      include: expenseInclude,
    });
    return jsonFor(user, expense, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses");
  }
}
