import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { canViewFinancials } from "@/lib/permissions";

const INCLUDE = {
  lineItems: { orderBy: { order: "asc" as const } },
  project:   { select: { id: true, name: true } },
  // Pull client inline so we avoid an N+1 fetch per invoice
  client:    { select: { id: true, name: true, companyName: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");

    const { searchParams } = new URL(req.url);
    const clientId   = searchParams.get("clientId");
    const projectId  = searchParams.get("projectId");
    const status     = searchParams.get("status");
    const search     = searchParams.get("search");
    const pagination = parsePagination(searchParams);

    const where = {
      organizationId: user.organizationId,
      ...(clientId  ? { clientId }  : {}),
      // v3: an invoice built from a client's outstanding work spans several
      // projects and so carries no single projectId — which is why the
      // project Invoices tab used to come up empty. Match either the direct
      // link OR any billable line that came from this project.
      ...(projectId
        ? {
            OR: [
              { projectId },
              { billableItems: { some: { projectId } } },
            ],
          }
        : {}),
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

    // v2: amounts never reach MEMBER clients (server-side strip)
    const visible = canViewFinancials(user)
      ? invoices
      : invoices.map((inv) => ({
          ...inv,
          lineItems: (inv as { lineItems?: { unitPrice: unknown }[] }).lineItems?.map(
            (li) => ({ ...li, unitPrice: null }),
          ),
        }));

    if (pagination.paginated) {
      return NextResponse.json({
        data: visible,
        pagination: paginationMeta(pagination, total),
      });
    }
    // Legacy contract: array shape
    return NextResponse.json(visible);
  } catch (error) {
    return handleApiError(error, "GET /api/invoices");
  }
}

// ── Auto-generate invoice number (scoped per organization) ────
async function nextInvoiceNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  // Numeric max, not string ordering — "INV-2026-999" sorts above "INV-2026-1000".
  const existing = await tx.invoice.findMany({
    where:  { organizationId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  const max = existing.reduce(
    (m, inv) => Math.max(m, parseInt(inv.invoiceNumber.slice(prefix.length), 10) || 0),
    0
  );
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");

    const rl = checkRateLimit(req, `invoices:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) {
      return apiError("Too many requests, please slow down", 429);
    }

    const body = await req.json();
    const {
      clientId, projectId,
      dueDate, currency, discountPct, taxPct,
      notes, lineItems,
    } = body;

    if (!clientId) throw new ApiError("clientId is required", 400);

    // Verify the client (and optionally the project) belong to this org
    // before creating the invoice.
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!project) throw new ApiError("Project not found", 404);
    }

    // Wrap the whole create (invoice number lookup + invoice + line items) in a
    // single transaction so a mid-flight failure doesn't leave orphan rows or
    // claim an invoice number that wasn't actually used. Retried on number
    // collision (two concurrent creates computing the same next number).
    let invoice;
    for (let attempt = 0; ; attempt++) {
      try {
        invoice = await createInvoiceTx();
        break;
      } catch (e) {
        if ((e as { code?: string }).code === "P2002" && attempt < 3) continue;
        throw e;
      }
    }

    async function createInvoiceTx() {
      return prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, user.organizationId);

      let resolvedLineItems = lineItems as {
        description: string; quantity: number; unitPrice: number; unit?: string; order?: number;
        kind?: "PACKAGE" | "EXTRA" | "COMPLIMENTARY" | "ADHOC_TASK" | "CUSTOM";
        isFree?: boolean; contentItemId?: string | null;
        // v3: which billable item produced this line, so the builder can
        // never offer the same work twice.
        billableItemId?: string | null;
      }[] | undefined;
      let resolvedDiscountPct = discountPct != null ? parseFloat(discountPct) : null;
      let resolvedTaxPct = taxPct != null ? parseFloat(taxPct) : null;

      const created = await tx.invoice.create({
        data: {
          organizationId: user.organizationId,
          invoiceNumber,
          clientId,
          projectId:   projectId   || null,
          status:      "DRAFT",
          dueDate:     dueDate ? new Date(dueDate) : null,
          currency:    currency || "USD",
          discountPct: resolvedDiscountPct,
          taxPct:      resolvedTaxPct,
          notes:       notes?.trim() || null,
          lineItems: {
            create: (resolvedLineItems ?? []).map((li, i) => ({
              description: li.description,
              quantity:    li.quantity ?? 1,
              // Complimentary keeps its token amount; only a v2 zero-rated
              // line is forced to nothing.
              unitPrice:   (li.isFree && li.kind !== "COMPLIMENTARY") ? 0 : (li.unitPrice ?? 0),
              unit:        li.unit ?? null,
              order:       li.order ?? i,
              kind:        li.kind ?? "CUSTOM",
              // v3: a complimentary line is invoiced at its token amount (1)
              // so the client SEES the goodwill, and it totals like any other
              // line so the invoice adds up. isFree stays for v2's genuinely
              // zero-rated lines (docs/V3_CONTEXT.md §3).
              isFree:      !!li.isFree && li.kind !== "COMPLIMENTARY",
              contentItemId: li.contentItemId ?? null,
              billableItemId: li.billableItemId ?? null,
            })),
          },
        },
        include: INCLUDE,
      });

      // v2: stamp billed content items (included AND free — excluded ones
      // stay claimable next time)
      const billedIds = (resolvedLineItems ?? [])
        .filter((li) => li.kind === "EXTRA" && li.contentItemId)
        .map((li) => li.contentItemId!) as string[];
      if (billedIds.length) {
        await tx.contentItem.updateMany({
          where: { id: { in: billedIds }, organizationId: user.organizationId },
          data: { invoicedInId: created.id },
        });
      }

      // ── v3: consume the billable items this invoice was built from ──
      // Marking them INVOICED is what stops the builder re-offering them.
      // Anything the user unticked simply isn't in the list, so it stays
      // available for a later invoice.
      const consumed = (resolvedLineItems ?? [])
        .map((li) => li.billableItemId)
        .filter(Boolean) as string[];
      if (consumed.length) {
        await tx.billableItem.updateMany({
          where: { id: { in: consumed }, organizationId: user.organizationId },
          data: { status: "INVOICED", invoiceId: created.id },
        });

        // A cycle records where it was billed, so the Plan tab can say so.
        const cycles = await tx.billableItem.findMany({
          where: { id: { in: consumed }, cycleId: { not: null } },
          select: { cycleId: true },
        });
        const cycleIds = [...new Set(cycles.map((c) => c.cycleId!))];
        if (cycleIds.length) {
          await tx.projectCycle.updateMany({
            where: { id: { in: cycleIds } },
            data: { invoiceId: created.id },
          });
        }
      }

      return created;
      });
    }

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/invoices");
  }
}
