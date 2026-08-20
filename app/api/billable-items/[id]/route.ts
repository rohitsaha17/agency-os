import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";

/**
 * PATCH /api/billable-items/[id] — price it, or waive it.
 *
 * This is the ONE place an amount is set on work an SMM flagged. Setting an
 * amount moves it PENDING_PRICING → READY, which is what makes it appear in
 * the invoice builder (docs/V3_CONTEXT.md §3).
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");
    const { id } = await params;

    const existing = await prisma.billableItem.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, amount: true, label: true },
    });
    if (!existing) throw new ApiError("Billable item not found", 404);
    if (existing.status === "INVOICED") {
      throw new ApiError("This item is already on an invoice", 409);
    }

    const { amount, label, status, notes } = await req.json();

    const priced = amount != null && amount !== "";
    if (priced && !Number.isFinite(parseFloat(amount))) {
      throw new ApiError("Amount must be a number", 400);
    }

    const updated = await prisma.billableItem.update({
      where: { id },
      data: {
        ...(label !== undefined ? { label: String(label).trim() } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(amount !== undefined
          ? {
              amount: priced ? parseFloat(amount) : null,
              // Pricing it is what readies it; clearing the amount sends it
              // back to the queue rather than leaving a half-priced line.
              status: priced ? "READY" : "PENDING_PRICING",
            }
          : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "BILLABLE_ITEM",
      entityId: id,
      from: existing.status,
      to: updated.status,
      userId: user.id,
      note: priced ? `priced at ${updated.amount}` : "amount cleared",
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/billable-items/[id]");
  }
}

/** DELETE — waive it. Kept as a row so the decision stays on the record. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");
    const { id } = await params;

    const existing = await prisma.billableItem.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw new ApiError("Billable item not found", 404);
    if (existing.status === "INVOICED") {
      throw new ApiError("This item is already on an invoice", 409);
    }

    await prisma.billableItem.update({ where: { id }, data: { status: "WAIVED" } });
    await logStatus({
      organizationId: user.organizationId,
      entityType: "BILLABLE_ITEM",
      entityId: id,
      from: existing.status,
      to: "WAIVED",
      userId: user.id,
      note: "waived",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/billable-items/[id]");
  }
}
