import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// POST /api/clients/[id]/share-month — { month: YYYY-MM }
// Creates a ReviewBatch link listing all TEAM_APPROVED items of the month.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: clientId } = await params;
    const { month } = await req.json();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ApiError("month must be YYYY-MM", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const batch = await prisma.reviewBatch.create({
      data: {
        token: randomBytes(24).toString("hex"),
        organizationId: user.organizationId,
        clientId,
        month,
        expiresAt: new Date(Date.now() + 14 * 86400000),
        createdById: user.id,
      },
    });
    return NextResponse.json({ url: `/review/${batch.token}`, expiresAt: batch.expiresAt });
  } catch (error) {
    return handleApiError(error, "POST /api/clients/[id]/share-month");
  }
}
