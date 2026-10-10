import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor, requireCapability } from "@/lib/api-permissions";
import { canViewFinancials } from "@/lib/permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { assertInOrg } from "@/lib/assert-in-org";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    // v3: juniors have neither expenses.create nor financials.view
    requireCapability(user, "expenses.create");
    const expense = await prisma.expense.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        // Without financials.view you only ever reach your own expense —
        // a direct id shouldn't get past what the list already hides.
        ...(canViewFinancials(user) ? {} : { userId: user.id }),
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new ApiError("Not found", 404);
    return jsonFor(user, expense);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    // v3: juniors have neither expenses.create nor financials.view
    requireCapability(user, "expenses.create");
    const existing = await prisma.expense.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        // Without financials.view you only ever reach your own expense —
        // a direct id shouldn't get past what the list already hides.
        ...(canViewFinancials(user) ? {} : { userId: user.id }),
      },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    const body = await req.json();
    const {
      title, description, category, amount, currency,
      date, status, projectId, userId,
      isReimbursable, receiptUrl, notes,
    } = body;

    // QA-004: projectId/userId were written through without a tenant check.
    // Foreign id -> 404; empty -> no-op (clearing stays supported).
    await assertInOrg("project", projectId, user.organizationId, { label: "Project" });
    await assertInOrg("user", userId, user.organizationId, { label: "User" });

    // Who-it-belongs-to and its approval status are financial decisions. POST
    // already forces an expense onto the creator and refuses a body status for
    // non-financial users; PATCH must do the same, or an SMM/TEAM member editing
    // their own reimbursement could set status to APPROVED/PAID (self-approval)
    // or hand it to a colleague. Those two fields are ignored unless you may see
    // money; everything else on your own expense stays editable.
    const maySetFinancial = canViewFinancials(user);

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(maySetFinancial && status !== undefined ? { status } : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...(maySetFinancial && userId !== undefined ? { userId: userId || null } : {}),
        ...(isReimbursable !== undefined ? { isReimbursable } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl: receiptUrl?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return jsonFor(user, expense);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    // v3: juniors have neither expenses.create nor financials.view
    requireCapability(user, "expenses.create");
    const existing = await prisma.expense.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        // Without financials.view you only ever reach your own expense —
        // a direct id shouldn't get past what the list already hides.
        ...(canViewFinancials(user) ? {} : { userId: user.id }),
      },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    await prisma.expense.delete({ where: { id } });
    return jsonFor(user, { success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/[id]");
  }
}
