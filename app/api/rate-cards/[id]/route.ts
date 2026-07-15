import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.rateCard.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

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
  } catch (error) {
    return handleApiError(error, "PATCH /api/rate-cards/[id]");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.rateCard.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    // Soft delete by deactivating
    await prisma.rateCard.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/rate-cards/[id]");
  }
}
