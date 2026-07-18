import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// ── Helpers ──────────────────────────────────────────────────

// Generate sequential quotation number, unique per organization: QUO-YYYY-NNN.
// Max is computed numerically (string ordering would rank 999 above 1000).
async function generateNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QUO-${year}-`;
  const existing = await prisma.quotation.findMany({
    where: { organizationId, number: { startsWith: prefix } },
    select: { number: true },
  });
  const max = existing.reduce(
    (m, q) => Math.max(m, parseInt(q.number.slice(prefix.length), 10) || 0),
    0
  );
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Recompute subtotal and total from line items + discount + tax
function computeTotals(
  lineItems: { quantity: number; unitPrice: number }[],
  discountType: string | null,
  discountValue: number,
  taxRate: number
) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount =
    discountType === "PERCENT"
      ? (subtotal * discountValue) / 100
      : discountType === "AMOUNT"
      ? discountValue
      : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + taxAmount;
  return { subtotal, total };
}

// ── GET /api/quotations ──────────────────────────────────────

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const quotations = await prisma.quotation.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId && { clientId }),
        ...(status && { status: status as never }),
      },
      include: {
        client: { select: { id: true, name: true, companyName: true, logoUrl: true } },
        _count: { select: { lineItems: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(quotations);
  } catch (error) {
    return handleApiError(error, "GET /api/quotations");
  }
}

// ── POST /api/quotations ─────────────────────────────────────

export async function POST(req: Request) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      clientId, title, description, pricingType,
      validUntil, currency, discountType, discountValue,
      taxRate, notes, terms, lineItems = [],
    } = body;

    if (!clientId) throw new ApiError("Client is required", 400);
    if (!title?.trim()) throw new ApiError("Title is required", 400);

    // Confirm the target client belongs to the caller's org.
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const parsedItems = (lineItems as {
      title: string; description?: string; pricingType: string;
      quantity: string; unitPrice: string; unit?: string; rateCardId?: string;
    }[]).map((item, i) => ({
      title: item.title,
      description: item.description?.trim() || null,
      pricingType: (item.pricingType || "PER_ITEM") as import("@prisma/client").PricingType,
      quantity: parseFloat(item.quantity) || 1,
      unitPrice: parseFloat(item.unitPrice) || 0,
      unit: item.unit?.trim() || null,
      subtotal: (parseFloat(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0),
      rateCardId: item.rateCardId || null,
      order: i,
    }));

    const { subtotal, total } = computeTotals(
      parsedItems,
      discountType || null,
      parseFloat(discountValue) || 0,
      parseFloat(taxRate) || 0
    );

    // Retry on number collision — two simultaneous creates in the same org
    // can compute the same next number; the @@unique constraint catches it.
    let quotation;
    for (let attempt = 0; ; attempt++) {
      const number = await generateNumber(user.organizationId);
      try {
        quotation = await createQuotation(number);
        break;
      } catch (e) {
        if ((e as { code?: string }).code === "P2002" && attempt < 3) continue;
        throw e;
      }
    }

    async function createQuotation(number: string) {
      return prisma.quotation.create({
      data: {
        organizationId: user.organizationId,
        number,
        clientId,
        title: title.trim(),
        description: description?.trim() || null,
        pricingType: pricingType || "FIXED",
        validUntil: validUntil ? new Date(validUntil) : null,
        currency: currency || "USD",
        discountType: discountType || null,
        discountValue: parseFloat(discountValue) || 0,
        taxRate: parseFloat(taxRate) || 0,
        subtotal,
        total,
        notes: notes?.trim() || null,
        terms: terms?.trim() || null,
        lineItems: {
          create: parsedItems,
        },
      },
      include: {
        client: { select: { id: true, name: true, companyName: true, email: true, logoUrl: true } },
        lineItems: { orderBy: { order: "asc" } },
      },
      });
    }

    return NextResponse.json(quotation, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/quotations");
  }
}
