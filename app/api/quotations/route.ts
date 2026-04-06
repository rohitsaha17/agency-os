import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Helpers ──────────────────────────────────────────────────

// Generate sequential quotation number: QUO-YYYY-NNN
async function generateNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QUO-${year}-`;
  const latest = await prisma.quotation.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = latest ? parseInt(latest.number.split("-")[2] ?? "0") + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
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
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const quotations = await prisma.quotation.findMany({
      where: {
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
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// ── POST /api/quotations ─────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      clientId, title, description, pricingType,
      validUntil, currency, discountType, discountValue,
      taxRate, notes, terms, lineItems = [],
    } = body;

    if (!clientId) return NextResponse.json({ error: "Client is required" }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const number = await generateNumber();
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

    const quotation = await prisma.quotation.create({
      data: {
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

    return NextResponse.json(quotation, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create quotation" }, { status: 500 });
  }
}
