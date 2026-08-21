import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/billables
 *
 * What this project still owes an invoice, and which invoice it should go on.
 *
 * Closing a cycle produces billable items and then says nothing more about
 * them — they sit in the invoice builder on another screen, so extras from a
 * closed cycle could be forgotten until someone happened to look. This lets
 * the project say so where the closing actually happened.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, clientId: true, currency: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    const items = await prisma.billableItem.findMany({
      where: {
        organizationId: user.organizationId,
        projectId: id,
        status: { in: ["PENDING_PRICING", "READY"] },
        invoiceId: null,
      },
      select: {
        id: true, label: true, kind: true, amount: true, status: true,
        cycle: { select: { id: true, label: true } },
        contentItem: { select: { id: true, topic: true, creativeType: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Where the extras should land: the most recent invoice for this project
    // that can still be changed. PAID and CANCELLED are closed documents —
    // adding to those is a credit note, not an edit.
    const openInvoice = await prisma.invoice.findFirst({
      where: {
        organizationId: user.organizationId,
        projectId: id,
        status: { in: ["DRAFT", "SENT", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, status: true },
    });

    const ready = items.filter((i) => i.status === "READY");

    return NextResponse.json({
      currency: project.currency,
      ready,
      needsPricing: items.filter((i) => i.status === "PENDING_PRICING"),
      readyTotal: ready.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      openInvoice,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/billables");
  }
}
