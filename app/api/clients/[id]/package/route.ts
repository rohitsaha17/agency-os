import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { canViewFinancials } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

function strip(pkg: { billingAmount: unknown; [k: string]: unknown } | null, showMoney: boolean) {
  if (!pkg) return null;
  return { ...pkg, billingAmount: showMoney ? pkg.billingAmount : null };
}

// GET /api/clients/[id]/package — ALL active packages + history.
// A client may run several packages simultaneously (e.g. one for social
// media, one for the website); their quotas merge in the month summary.
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
    const actives = packages.filter((p) => p.isActive);
    return jsonFor(user, {
      actives: actives.map((p) => strip(p, showMoney)),
      // legacy shape kept for any older callers
      active: strip(actives[0] ?? null, showMoney),
      history: packages.filter((p) => !p.isActive).map((p) => strip(p, showMoney)),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]/package");
  }
}

// POST /api/clients/[id]/package — add a package (packages can run
// concurrently). Pass replacePackageId to deactivate ONE existing package
// in the same transaction (the "replace" flow).
// Body: { name, startMonth: YYYY-MM, endMonth?: YYYY-MM, billingAmount?,
//         currency?, notes?, quotas: [{ creativeTypeId, monthlyQty }],
//         replacePackageId? }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id: clientId } = await params;
    const { name, startMonth, endMonth, billingAmount, currency, notes, quotas, replacePackageId } = await req.json();

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
      if (replacePackageId) {
        await tx.clientPackage.updateMany({
          where: { id: replacePackageId, clientId, organizationId: user.organizationId },
          data: { isActive: false },
        });
      }
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
    return jsonFor(user, created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/clients/[id]/package");
  }
}

// PATCH /api/clients/[id]/package — { packageId, isActive } toggle
// (deactivating moves the package to history; its months stay accountable).
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id: clientId } = await params;
    const { packageId, isActive } = await req.json();

    const pkg = await prisma.clientPackage.findFirst({
      where: { id: packageId, clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!pkg) throw new ApiError("Package not found", 404);

    const updated = await prisma.clientPackage.update({
      where: { id: packageId },
      data: { isActive: !!isActive },
      include: { quotas: { include: { creativeType: { select: { id: true, name: true, icon: true } } } } },
    });
    return jsonFor(user, strip(updated, canViewFinancials(user)));
  } catch (error) {
    return handleApiError(error, "PATCH /api/clients/[id]/package");
  }
}
