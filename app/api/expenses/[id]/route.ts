import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const expense = await prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new ApiError("Not found", 404);
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    const body = await req.json();
    const {
      title, description, category, amount, currency,
      date, status, projectId, userId,
      isReimbursable, receiptUrl, notes,
    } = body;

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...(userId !== undefined ? { userId: userId || null } : {}),
        ...(isReimbursable !== undefined ? { isReimbursable } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl: receiptUrl?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/[id]");
  }
}
