import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { computeMonthSummary } from "@/lib/quota";
import { canViewFinancials } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/month-summary?month=YYYY-MM
// Members get counts but never billing amounts.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: clientId } = await params;
    const month = req.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ApiError("month must be YYYY-MM", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const summary = await computeMonthSummary(user.organizationId, clientId, month);
    if (!canViewFinancials(user)) {
      summary.packages = summary.packages.map((p) => ({ ...p, billingAmount: null }));
      if (summary.package) summary.package = { ...summary.package, billingAmount: null };
    }
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]/month-summary");
  }
}
