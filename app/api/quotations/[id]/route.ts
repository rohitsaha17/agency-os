import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function computeTotals(
  lineItems: { quantity: number; unitPrice: number }[],
  discountType: string | null,
  discountValue: number,
  taxRate: number
) {
  const subtotal = lineItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const discountAmount =
    discountType === "PERCENT"
      ? (subtotal * discountValue) / 100
      : discountType === "AMOUNT"
      ? discountValue
      : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const total = afterDiscount + (afterDiscount * taxRate) / 100;
  return { subtotal, total };
}

// ── GET ──────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, companyName: true, email: true, logoUrl: true } },
        lineItems: { orderBy: { order: "asc" } },
        project: { select: { id: true, name: true } },
      },
    });

    if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(quotation);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      title, description, pricingType, validUntil,
      currency, discountType, discountValue, taxRate,
      notes, terms, lineItems, status,
    } = body;

    // If updating line items, replace them all
    let subtotalVal: number | undefined;
    let totalVal: number | undefined;

    if (lineItems !== undefined) {
      const parsedItems = (lineItems as {
        title: string; description?: string; pricingType: string;
        quantity: string; unitPrice: string; unit?: string; rateCardId?: string;
      }[]).map((item, i) => ({
        title: item.title,
        description: item.description?.trim() || null,
        pricingType: item.pricingType || "PER_ITEM",
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
        unit: item.unit?.trim() || null,
        subtotal: (parseFloat(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0),
        rateCardId: item.rateCardId || null,
        order: i,
      }));

      const disc = discountType !== undefined
        ? discountType
        : (await prisma.quotation.findUnique({ where: { id }, select: { discountType: true } }))?.discountType ?? null;
      const discVal = discountValue !== undefined
        ? parseFloat(discountValue) || 0
        : Number((await prisma.quotation.findUnique({ where: { id }, select: { discountValue: true } }))?.discountValue ?? 0);
      const tax = taxRate !== undefined
        ? parseFloat(taxRate) || 0
        : Number((await prisma.quotation.findUnique({ where: { id }, select: { taxRate: true } }))?.taxRate ?? 0);

      const totals = computeTotals(parsedItems, disc, discVal, tax);
      subtotalVal = totals.subtotal;
      totalVal = totals.total;

      // Delete existing and recreate
      await prisma.quotationLineItem.deleteMany({ where: { quotationId: id } });
      await prisma.quotationLineItem.createMany({
        data: parsedItems.map((item) => ({ ...item, quotationId: id, pricingType: item.pricingType as import("@prisma/client").PricingType })),
      });
    }

    const updated = await prisma.quotation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(pricingType !== undefined && { pricingType }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(currency !== undefined && { currency }),
        ...(discountType !== undefined && { discountType: discountType || null }),
        ...(discountValue !== undefined && { discountValue: parseFloat(discountValue) || 0 }),
        ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) || 0 }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(terms !== undefined && { terms: terms?.trim() || null }),
        ...(status !== undefined && { status }),
        ...(subtotalVal !== undefined && { subtotal: subtotalVal }),
        ...(totalVal !== undefined && { total: totalVal }),
      },
      include: {
        client: { select: { id: true, name: true, companyName: true, email: true, logoUrl: true } },
        lineItems: { orderBy: { order: "asc" } },
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update quotation" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.quotation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete quotation" }, { status: 500 });
  }
}
