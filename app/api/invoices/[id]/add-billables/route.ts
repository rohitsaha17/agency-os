import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/[id]/add-billables
 *
 * Append work to an invoice that already exists.
 *
 * A retainer is usually billed before the cycle starts, so by the time the
 * cycle closes and over-delivery is priced, there is already an invoice for
 * that period. Raising a second one splits a single month's billing across
 * two documents and two payment references, which is a reconciliation problem
 * for the client and for whoever chases the money. So the extras go onto the
 * invoice that is already there.
 *
 * Only an open invoice can be topped up. Adding a line to something already
 * paid would change the amount owed on a settled document — that is a credit
 * note, not an edit, and it is not this endpoint's job.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");

    const rl = checkRateLimit(req, `invoices:addlines:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.billableItemIds) ? body.billableItemIds : [];
    if (ids.length === 0) throw new ApiError("billableItemIds is required", 400);

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, invoiceNumber: true, status: true, clientId: true,
        lineItems: { select: { order: true } },
      },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      throw new ApiError(
        `Invoice ${invoice.invoiceNumber} is ${invoice.status.toLowerCase()} — `
        + "issue a new invoice for this work rather than changing a closed one",
        409,
      );
    }

    // Only priced, unbilled work belonging to the same client. Anything still
    // at PENDING_PRICING has no amount, so billing it would put a zero on the
    // invoice and quietly write off the extra.
    const items = await prisma.billableItem.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        clientId: invoice.clientId,
        status: "READY",
        invoiceId: null,
      },
      select: { id: true, label: true, kind: true, amount: true, contentItemId: true },
    });

    if (items.length === 0) {
      throw new ApiError(
        "Nothing to add — those items are already invoiced, still need pricing, "
        + "or belong to a different client",
        400,
      );
    }

    let nextOrder = invoice.lineItems.reduce((m, li) => Math.max(m, li.order), -1) + 1;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.createMany({
        data: items.map((it) => ({
          invoiceId: invoice.id,
          description: it.label,
          quantity: 1,
          // On a COMPLIMENTARY line this is what the work was WORTH; the
          // token charged is applied when the invoice is totalled, so the
          // client sees the value of what they were given.
          unitPrice: it.amount ?? 0,
          order: nextOrder++,
          kind: it.kind,
          contentItemId: it.contentItemId,
          billableItemId: it.id,
        })),
      });

      await tx.billableItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { status: "INVOICED", invoiceId: invoice.id },
      });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          lineItems: { orderBy: { order: "asc" } },
          receipts: { select: { id: true, amount: true, receivedAt: true, method: true, reference: true } },
          client: { select: { id: true, name: true, companyName: true } },
          project: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json({
      invoice: updated,
      added: items.length,
      /** Asked for but not addable — worth telling the caller about. */
      skipped: ids.length - items.length,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/invoices/[id]/add-billables");
  }
}
