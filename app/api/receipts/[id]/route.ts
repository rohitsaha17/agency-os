import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

const receiptInclude = {
  client: { select: { id: true, name: true, companyName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: receiptInclude,
    });
    if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(receipt);
  } catch (err) {
    return handleApiError(err, "GET /api/receipts/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const {
      invoiceId, amount, currency, receivedAt,
      method, reference, receiptNumber, notes, attachmentUrl,
    } = body;

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
    await requireAuth(req);
    const { id } = await params;
    await prisma.receipt.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/receipts/[id]");
  }
}
