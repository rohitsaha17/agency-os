import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const expenseInclude = {
  project:     { select: { id: true, name: true, clientId: true } },
  client:      { select: { id: true, name: true, companyName: true } },
  stakeholder: { select: { id: true, name: true, type: true } },
  user:        { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId     = searchParams.get("projectId");
  const clientId      = searchParams.get("clientId");
  const stakeholderId = searchParams.get("stakeholderId");
  const category      = searchParams.get("category");
  const status        = searchParams.get("status");
  const search        = searchParams.get("search");
  // When `clientId` is provided we want ALL expenses for that client —
  // either tagged directly OR tagged to a project that belongs to the client.
  // Opt-in via `?clientId=xxx&includeProjectExpenses=1`.
  const includeProjectExpenses = searchParams.get("includeProjectExpenses") === "1";

  try {
    const where: Record<string, unknown> = {
      ...(projectId     ? { projectId }     : {}),
      ...(stakeholderId ? { stakeholderId } : {}),
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
    return NextResponse.json(expenses);
  } catch (error) {
    console.error("[GET /api/expenses]", error);
    return NextResponse.json({ error: "Failed to load expenses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title, description, category, amount, currency,
      date, status, projectId, clientId, stakeholderId, userId,
      isReimbursable, receiptUrl, notes,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!amount || isNaN(parseFloat(amount))) return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });

    const expense = await prisma.expense.create({
      data: {
        title:          title.trim(),
        description:    description?.trim() || null,
        category:       category || "OTHER",
        amount:         parseFloat(amount),
        currency:       currency || "USD",
        date:           date ? new Date(date) : new Date(),
        status:         status || "PENDING",
        projectId:      projectId      || null,
        clientId:       clientId       || null,
        stakeholderId:  stakeholderId  || null,
        userId:         userId         || null,
        isReimbursable: !!isReimbursable,
        receiptUrl:     receiptUrl?.trim() || null,
        notes:          notes?.trim()  || null,
      },
      include: expenseInclude,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("[POST /api/expenses]", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
