import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const quotation = await prisma.quotation.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { status: true },
    });

    if (!quotation) throw new ApiError("Not found", 404);
    if (quotation.status !== "DRAFT") {
      throw new ApiError("Only DRAFT quotations can be sent", 400);
    }

    const updated = await prisma.quotation.update({
      where: { id },
      data: { status: "SENT" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "POST /api/quotations/[id]/send");
  }
}
