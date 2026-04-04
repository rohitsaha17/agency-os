import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rateCards = await prisma.rateCard.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rateCards);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, category, pricingType, unit, unitPrice, currency } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!unitPrice || isNaN(parseFloat(unitPrice))) {
      return NextResponse.json({ error: "Valid unit price is required" }, { status: 400 });
    }

    const rateCard = await prisma.rateCard.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        pricingType: pricingType || "PER_ITEM",
        unit: unit?.trim() || "hour",
        unitPrice: parseFloat(unitPrice),
        currency: currency || "USD",
      },
    });

    return NextResponse.json(rateCard, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create rate card" }, { status: 500 });
  }
}
