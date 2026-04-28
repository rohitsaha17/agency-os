import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

const INCLUDE = {
  lineItems: { orderBy: { order: "asc" as const } },
  project:   { select: { id: true, name: true } },
  quotation: { select: { id: true, number: true, title: true } },
  client:    { select: { id: true, name: true, companyName: true } },
} as const;

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
    if (!invoice) throw new ApiError("Invoice not found", 404);
    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error, "GET /api/invoices/[id]");
  }
}

// NOTE: the frontend uses PATCH (per invoices page code), but rate-limiting
// the write both ways is fine. We treat PATCH here as the write mutation.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `invoices:update:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;
    const body = await req.json();
    const { status, dueDate, currency, discountPct, taxPct, notes, paidAt, lineItems } = body;

    // Wrap line-item replacement + invoice update in a single transaction so
    // a mid-flight error can't leave the invoice with an empty lineItems set.
    const invoice = await prisma.$transaction(async (tx) => {
      if (lineItems !== undefined) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        if (Array.isArray(lineItems) && lineItems.length > 0) {
          await tx.invoiceLineItem.createMany({
            data: (lineItems as { description: string; quantity: number; unitPrice: number; unit?: string; order?: number }[])
              .map((li, i) => ({
                invoiceId:   id,
                description: li.description,
                quantity:    li.quantity ?? 1,
                unitPrice:   li.unitPrice ?? 0,
                unit:        li.unit ?? null,
                order:       li.order ?? i,
              })),
          });
        }
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(status      !== undefined ? { status } : {}),
          ...(dueDate     !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(currency    !== undefined ? { currency } : {}),
          ...(discountPct !== undefined ? { discountPct: discountPct != null ? parseFloat(discountPct) : null } : {}),
          ...(taxPct      !== undefined ? { taxPct:      taxPct     != null ? parseFloat(taxPct)     : null } : {}),
          ...(notes       !== undefined ? { notes: notes?.trim() || null } : {}),
          ...(paidAt      !== undefined ? { paidAt: paidAt ? new Date(paidAt) : null } : {}),
          ...(status === "PAID" && paidAt === undefined ? { paidAt: new Date() } : {}),
        },
        include: INCLUDE,
      });
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error, "PATCH /api/invoices/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id } = await params;

    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/invoices/[id]");
  }
}
