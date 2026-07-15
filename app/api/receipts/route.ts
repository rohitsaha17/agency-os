import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

const receiptInclude = {
  client: { select: { id: true, name: true, companyName: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
};

// GET /api/receipts — list, filterable by clientId / invoiceId
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const invoiceId = searchParams.get("invoiceId") ?? undefined;

    const receipts = await prisma.receipt.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId && { clientId }),
        ...(invoiceId && { invoiceId }),
      },
      include: receiptInclude,
      orderBy: { receivedAt: "desc" },
    });

    return NextResponse.json(receipts);
  } catch (err) {
    return handleApiError(err, "GET /api/receipts");
  }
}

// POST /api/receipts — create a new receipt
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const rl = checkRateLimit(req, `receipts:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests", 429);

    const body = await req.json();
    const {
      clientId, invoiceId, amount, currency, receivedAt,
      method, reference, receiptNumber, notes, attachmentUrl,
    } = body;

    if (!clientId) throw new ApiError("clientId is required", 400);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new ApiError("Amount must be a positive number", 400);

    // Confirm the target client (and invoice, if any) belong to the caller's org.
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);
    if (invoiceId) {
      const inv = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!inv) throw new ApiError("Invoice not found", 404);
    }

    const receipt = await prisma.receipt.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        invoiceId: invoiceId || null,
        amount: amt,
        currency: currency || "USD",
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        method: method || "BANK_TRANSFER",
        reference: reference?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        notes: notes?.trim() || null,
        attachmentUrl: attachmentUrl?.trim() || null,
      },
      include: receiptInclude,
    });

    return NextResponse.json(receipt, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/receipts");
  }
}
