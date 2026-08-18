import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { canViewFinancials } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

function strip(pkg: { billingAmount: unknown; [k: string]: unknown } | null, showMoney: boolean) {
  if (!pkg) return null;
  return { ...pkg, billingAmount: showMoney ? pkg.billingAmount : null };
}

// GET /api/clients/[id]/package — active package + history
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: clientId } = await params;
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const packages = await prisma.clientPackage.findMany({
      where: { clientId, organizationId: user.organizationId },
      include: { quotas: { include: { creativeType: { select: { id: true, name: true, icon: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const showMoney = canViewFinancials(user);
    const active = packages.find((p) => p.isActive) ?? null;
    return NextResponse.json({
      active: strip(active, showMoney),
      history: packages.filter((p) => !p.isActive).map((p) => strip(p, showMoney)),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]/package");
  }
}

// POST /api/clients/[id]/package — create/replace the active package.
// Enforces max one active package per client (previous ones deactivate).
// Body: { name, startMonth: YYYY-MM, endMonth?: YYYY-MM, billingAmount?,
//         currency?, notes?, quotas: [{ creativeTypeId, monthlyQty }] }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id: clientId } = await params;
    const { name, startMonth, endMonth, billingAmount, currency, notes, quotas } = await req.json();

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true, currency: true },
    });
    if (!client) throw new ApiError("Client not found", 404);
    if (!name?.trim()) throw new ApiError("Package name is required", 400);
    if (!startMonth || !/^\d{4}-\d{2}$/.test(startMonth)) throw new ApiError("startMonth must be YYYY-MM", 400);
    if (endMonth && !/^\d{4}-\d{2}$/.test(endMonth)) throw new ApiError("endMonth must be YYYY-MM", 400);

    const quotaRows: { creativeTypeId: string; monthlyQty: number }[] =
      (Array.isArray(quotas) ? quotas : [])
        .filter((q) => q.creativeTypeId && Number(q.monthlyQty) > 0)
        .map((q) => ({ creativeTypeId: q.creativeTypeId, monthlyQty: Math.floor(Number(q.monthlyQty)) }));

    const created = await prisma.$transaction(async (tx) => {
      await tx.clientPackage.updateMany({
        where: { clientId, organizationId: user.organizationId, isActive: true },
        data: { isActive: false },
      });
      return tx.clientPackage.create({
        data: {
          organizationId: user.organizationId,
          clientId,
          name: name.trim(),
          startMonth: new Date(`${startMonth}-01T00:00:00.000Z`),
          endMonth: endMonth ? new Date(`${endMonth}-01T00:00:00.000Z`) : null,
          billingAmount: billingAmount != null && billingAmount !== "" ? billingAmount : null,
          currency: currency?.trim() || client.currency || null,
          notes: notes?.trim() || null,
          quotas: { create: quotaRows },
        },
        include: { quotas: { include: { creativeType: { select: { id: true, name: true, icon: true } } } } },
      });
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/clients/[id]/package");
  }
}
