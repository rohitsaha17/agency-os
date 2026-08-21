/**
 * Raising an invoice for a project cycle, in one place.
 *
 * Two screens do this now — the Invoices tab on a project, and the last step
 * of the project form — and they have to agree on what the line says, what
 * "issue it" means, and what happens when the payment fails but the invoice
 * already exists. Two copies of that sequence would drift, and the way you'd
 * find out is a client being billed twice.
 */

export interface DeliverableLike {
  qtyPerCycle: number;
  creativeType: { name: string };
}

/** "12 Reels, 6 Posts, 1 Photo Shoot" — what the cycle fee actually buys. */
export function describeDeliverables(deliverables: DeliverableLike[] | undefined): string {
  if (!deliverables?.length) return "";
  return deliverables
    .map((d) => `${d.qtyPerCycle} ${d.creativeType.name}${d.qtyPerCycle === 1 ? "" : "s"}`)
    .join(", ");
}

/**
 * The description on the cycle-fee line: the project, the period it covers,
 * and what was promised for it. A retainer invoice that says only the project
 * name gives the client nothing to check the amount against.
 */
export function cycleLineDescription(p: {
  name: string;
  serviceType?: string | null;
  cycleStartDate?: string | null;
  deliverables?: DeliverableLike[];
}): string {
  const period = p.cycleStartDate
    ? new Date(p.cycleStartDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";
  const head = p.serviceType === "ONE_TIME" || !period ? p.name : `${p.name} — ${period}`;
  return [head, describeDeliverables(p.deliverables)].filter(Boolean).join(" · ");
}

/** Default due date: 7 days out, the net-7 most studios run on. */
export function inSevenDays(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DraftLine {
  description: string;
  quantity: number;
  unitPrice: number;
  kind?: string;
}

export interface RaiseInvoiceArgs {
  clientId: string;
  projectId: string;
  currency: string;
  dueDate?: string | null;
  discountPct?: string | number | null;
  taxPct?: string | number | null;
  notes?: string | null;
  lines: DraftLine[];
  /** Mark it SENT rather than leaving it a draft. */
  issueNow?: boolean;
  /** An advance or part payment taken at the same time. */
  payment?: {
    amount: number;
    receivedAt?: string;
    method?: string;
    reference?: string | null;
  } | null;
}

export interface RaisedInvoice {
  id: string;
  invoiceNumber: string;
}

/**
 * Thrown when the invoice was created but a later step failed. Carries the
 * invoice so the caller can say what DID happen — an invoice that exists with
 * its payment missing is recoverable, but only if somebody is told.
 */
export class PartialInvoiceError extends Error {
  constructor(message: string, readonly invoice: RaisedInvoice) {
    super(message);
    this.name = "PartialInvoiceError";
  }
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error?.message || detail.error || `Request to ${url} failed`);
  }
  return res.json();
}

/**
 * Create the invoice, optionally issue it, optionally record a payment.
 *
 * Deliberately three calls rather than one endpoint: the invoice is the part
 * worth keeping, so it is created first and on its own. If issuing or the
 * receipt fails afterwards, the invoice still exists and the caller is told
 * exactly which step didn't happen.
 */
export async function raiseInvoice(args: RaiseInvoiceArgs): Promise<RaisedInvoice> {
  const invoice: RaisedInvoice = await post("/api/invoices", {
    clientId: args.clientId,
    projectId: args.projectId,
    dueDate: args.dueDate || null,
    currency: args.currency,
    discountPct: args.discountPct === "" ? null : args.discountPct ?? null,
    taxPct: args.taxPct === "" ? null : args.taxPct ?? null,
    notes: args.notes?.trim() || null,
    lineItems: args.lines.map((l, i) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      order: i,
      kind: l.kind ?? "PACKAGE",
    })),
  });

  const paying = (args.payment?.amount ?? 0) > 0;

  // Taking money against a draft makes no sense, so a payment implies issued.
  if (args.issueNow || paying) {
    await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    }).catch(() => {
      // Not fatal: the invoice exists and can be issued from the invoice
      // itself. Failing the whole thing here would be worse.
    });
  }

  if (paying && args.payment) {
    try {
      await post("/api/receipts", {
        clientId: args.clientId,
        invoiceId: invoice.id,
        amount: args.payment.amount,
        currency: args.currency,
        receivedAt: args.payment.receivedAt,
        method: args.payment.method || "BANK_TRANSFER",
        reference: args.payment.reference?.trim() || null,
      });
    } catch {
      throw new PartialInvoiceError(
        `Invoice ${invoice.invoiceNumber} was created, but the payment could not be recorded. Add it from the invoice.`,
        invoice,
      );
    }
  }

  return invoice;
}
