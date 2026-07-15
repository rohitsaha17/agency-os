import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req);
    const rateCards = await prisma.rateCard.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rateCards);
  } catch (error) {
    return handleApiError(error, "GET /api/rate-cards");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { name, description, category, pricingType, unit, unitPrice, currency } = body;

    if (!name?.trim()) {
      throw new ApiError("Name is required", 400);
    }
    if (!unitPrice || isNaN(parseFloat(unitPrice))) {
      throw new ApiError("Valid unit price is required", 400);
    }

    const rateCard = await prisma.rateCard.create({
      data: {
        organizationId: user.organizationId,
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
  } catch (error) {
    return handleApiError(error, "POST /api/rate-cards");
  }
}
