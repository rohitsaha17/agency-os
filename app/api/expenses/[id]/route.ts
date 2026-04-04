import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        stakeholder: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(expense);
  } catch (error) {
    console.error("[GET /api/expenses/[id]]", error);
    return NextResponse.json({ error: "Failed to load expense" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    const {
      title, description, category, amount, currency,
      date, status, projectId, stakeholderId, userId,
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
        ...(stakeholderId !== undefined ? { stakeholderId: stakeholderId || null } : {}),
        ...(userId !== undefined ? { userId: userId || null } : {}),
        ...(isReimbursable !== undefined ? { isReimbursable } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl: receiptUrl?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        stakeholder: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense);
  } catch (error) {
    console.error("[PATCH /api/expenses/[id]]", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/expenses/[id]]", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
