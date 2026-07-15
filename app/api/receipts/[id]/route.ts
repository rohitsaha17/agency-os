import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

const receiptInclude = {
  client: { select: { id: true, name: true, companyName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const receipt = await prisma.receipt.findFirst({
      where: { id, organizationId: user.organizationId },
      include: receiptInclude,
    });
    if (!receipt) throw new ApiError("Not found", 404);
    return NextResponse.json(receipt);
  } catch (err) {
    return handleApiError(err, "GET /api/receipts/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.receipt.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    const body = await req.json();
    const {
      invoiceId, amount, currency, receivedAt,
      method, reference, receiptNumber, notes, attachmentUrl,
    } = body;

    if (invoiceId) {
      const inv = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!inv) throw new ApiError("Invoice not found", 404);
    }

    const receipt = await prisma.receipt.update({
      where: { id },
      data: {
        ...(invoiceId !== undefined && { invoiceId: invoiceId || null }),
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(currency !== undefined && { currency }),
        ...(receivedAt !== undefined && { receivedAt: new Date(receivedAt) }),
        ...(method !== undefined && { method }),
        ...(reference !== undefined && { reference: reference?.trim() || null }),
        ...(receiptNumber !== undefined && { receiptNumber: receiptNumber?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(attachmentUrl !== undefined && { attachmentUrl: attachmentUrl?.trim() || null }),
      },
      include: receiptInclude,
    });
    return NextResponse.json(receipt);
  } catch (err) {
    return handleApiError(err, "PATCH /api/receipts/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.receipt.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    await prisma.receipt.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/receipts/[id]");
  }
}
