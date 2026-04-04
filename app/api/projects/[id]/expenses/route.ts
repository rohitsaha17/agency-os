import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id]/expenses — expenses + budget vs actual summary
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  try {
    const [expenses, project] = await Promise.all([
      prisma.expense.findMany({
        where: { projectId },
        orderBy: { date: "desc" },
        include: {
          stakeholder: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.project.findUnique({
        where: { id: projectId },
        select: { budget: true, currency: true },
      }),
    ]);

    const totalSpent = expenses
      .filter((e) => e.status !== "REJECTED")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const reimbursableTotal = expenses
      .filter((e) => e.isReimbursable && e.status !== "REJECTED")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return NextResponse.json({
      expenses,
      summary: {
        total: totalSpent,
        budget: project?.budget ? Number(project.budget) : null,
        remaining: project?.budget ? Number(project.budget) - totalSpent : null,
        reimbursable: reimbursableTotal,
        currency: project?.currency || "USD",
      },
    });
  } catch (error) {
    console.error("[GET /api/projects/[id]/expenses]", error);
    return NextResponse.json({ error: "Failed to load project expenses" }, { status: 500 });
  }
}
