import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

const INCLUDE = {
  lineItems: { orderBy: { order: "asc" as const } },
  project:   { select: { id: true, name: true } },
  quotation: { select: { id: true, number: true, title: true } },
  // Pull client inline so we avoid an N+1 fetch per invoice
  client:    { select: { id: true, name: true, companyName: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const clientId   = searchParams.get("clientId");
    const projectId  = searchParams.get("projectId");
    const status     = searchParams.get("status");
    const search     = searchParams.get("search");
    const pagination = parsePagination(searchParams);

    const where = {
      ...(clientId  ? { clientId }  : {}),
      ...(projectId ? { projectId } : {}),
      ...(status    ? { status: status as never } : {}),
      ...(search    ? { invoiceNumber: { contains: search, mode: "insensitive" as const } } : {}),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: INCLUDE,
        skip: pagination.paginated ? pagination.skip : undefined,
        take: pagination.paginated ? pagination.take : undefined,
      }),
      pagination.paginated ? prisma.invoice.count({ where }) : Promise.resolve(0),
    ]);

    if (pagination.paginated) {
      return NextResponse.json({
        data: invoices,
        pagination: paginationMeta(pagination, total),
      });
    }
    // Legacy contract: array shape
    return NextResponse.json(invoices);
  } catch (error) {
    return handleApiError(error, "GET /api/invoices");
  }
}

// ── Auto-generate invoice number ──────────────────────────────
async function nextInvoiceNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await tx.invoice.findFirst({
    where:   { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select:  { invoiceNumber: true },
  });
  let seq = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split("-");
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `invoices:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) {
      return apiError("Too many requests, please slow down", 429);
    }

    const body = await req.json();
    const {
      clientId, projectId, quotationId,
      dueDate, currency, discountPct, taxPct,
      notes, lineItems,
      fromQuotationId,
    } = body;

    if (!clientId) throw new ApiError("clientId is required", 400);

    // Wrap the whole create (invoice number lookup + invoice + line items) in a
    // single transaction so a mid-flight failure doesn't leave orphan rows or
    // claim an invoice number that wasn't actually used.
    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx);

      let resolvedLineItems = lineItems as {
        description: string; quantity: number; unitPrice: number; unit?: string; order?: number;
      }[] | undefined;

      if (fromQuotationId && !resolvedLineItems?.length) {
        const quotation = await tx.quotation.findUnique({
          where: { id: fromQuotationId },
          include: { lineItems: { orderBy: { order: "asc" } } },
        });
        if (quotation) {
          resolvedLineItems = quotation.lineItems.map((li, i) => ({
            description: li.title + (li.description ? ` — ${li.description}` : ""),
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice),
            unit: li.unit ?? undefined,
            order: i,
          }));
        }
      }

      return tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          projectId:   projectId   || null,
          quotationId: quotationId || fromQuotationId || null,
          status:      "DRAFT",
          dueDate:     dueDate ? new Date(dueDate) : null,
          currency:    currency || "USD",
          discountPct: discountPct != null ? parseFloat(discountPct) : null,
          taxPct:      taxPct     != null ? parseFloat(taxPct)     : null,
          notes:       notes?.trim() || null,
          lineItems: {
            create: (resolvedLineItems ?? []).map((li, i) => ({
              description: li.description,
              quantity:    li.quantity ?? 1,
              unitPrice:   li.unitPrice ?? 0,
              unit:        li.unit ?? null,
              order:       li.order ?? i,
            })),
          },
        },
        include: INCLUDE,
      });
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/invoices");
  }
}
