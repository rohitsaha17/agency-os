import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, category, pricingType, unit, unitPrice, currency, isActive } = body;

    const rateCard = await prisma.rateCard.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(category !== undefined && { category: category?.trim() || null }),
        ...(pricingType !== undefined && { pricingType }),
        ...(unit !== undefined && { unit: unit.trim() }),
        ...(unitPrice !== undefined && { unitPrice: parseFloat(unitPrice) }),
        ...(currency !== undefined && { currency }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(rateCard);
  } catch {
    return NextResponse.json({ error: "Failed to update rate card" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Soft delete by deactivating
    await prisma.rateCard.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete rate card" }, { status: 500 });
  }
}
