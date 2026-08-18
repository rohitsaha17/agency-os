import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { canViewFinancials } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id]/expenses — expenses + budget vs actual summary
export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  try {
    const user = await requireAuth(req);

    // Ensure the project belongs to the caller's org before returning any data.
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
      select: { budget: true, currency: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    const expenses = await prisma.expense.findMany({
      where: { projectId, organizationId: user.organizationId },
      orderBy: { date: "desc" },
      include: {
        stakeholder: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
    });

    const totalSpent = expenses
      .filter((e) => e.status !== "REJECTED")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const reimbursableTotal = expenses
      .filter((e) => e.isReimbursable && e.status !== "REJECTED")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // v2: amounts never reach MEMBER clients (server-side strip)
    if (!canViewFinancials(user)) {
      return NextResponse.json({
        expenses: expenses.map((e) => ({ ...e, amount: null })),
        summary: {
          total: null,
          budget: null,
          remaining: null,
          reimbursable: null,
          currency: project.currency || "USD",
        },
      });
    }

    return NextResponse.json({
      expenses,
      summary: {
        total: totalSpent,
        budget: project.budget ? Number(project.budget) : null,
        remaining: project.budget ? Number(project.budget) - totalSpent : null,
        reimbursable: reimbursableTotal,
        currency: project.currency || "USD",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/expenses");
  }
}
