// Canonical currency + number formatting helpers.
//
// Use these everywhere to keep formatting consistent across the app.
// Default precision is 2 decimal places.

export interface FormatMoneyOpts {
  precision?: number;
  compact?: boolean;
  locale?: string;
}

const DEFAULT_LOCALE = "en-US";

/**
 * Format a monetary value as a localized currency string.
 *
 * - Accepts numbers, numeric strings (e.g. Prisma Decimal via `.toString()`),
 *   or null/undefined (returns a dash placeholder).
 * - Uses Intl.NumberFormat with `style: "currency"`.
 * - Defaults to 2 decimal places.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "USD",
  opts?: FormatMoneyOpts,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";

  const precision = opts?.precision ?? 2;
  const locale = opts?.locale ?? DEFAULT_LOCALE;

  const formatOpts: Intl.NumberFormatOptions = {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  };
  if (opts?.compact) {
    formatOpts.notation = "compact";
    formatOpts.compactDisplay = "short";
  }

  try {
    return new Intl.NumberFormat(locale, formatOpts).format(n);
  } catch {
    // Fallback if the currency code is unsupported
    return `${currency} ${n.toFixed(precision)}`;
  }
}

/**
 * Format a plain number with a fixed precision and thousands separators.
 */
export function formatNumber(n: number, precision = 0): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(n);
}

// ── Invoice totals ────────────────────────────────────────────────────────
//
// Shared single source of truth for invoice total calculation, used both
// by the listing (calcTotal on an Invoice) and the creation modal (sum
// from draft line items + form rates).

export interface InvoiceLineItemLike {
  quantity: number | string;
  unitPrice: number | string;
  /**
   * v3: on a COMPLIMENTARY line, unitPrice holds what the work was WORTH.
   * Only the token is charged; the difference is shown as goodwill.
   */
  kind?: string | null;
  /** v2: a genuinely zero-rated line, excluded from totals entirely. */
  isFree?: boolean;
}

/** A complimentary line is charged this much: enough to appear, not to cost. */
export const COMPLIMENTARY_TOKEN = 1;

export function isComplimentary(li: InvoiceLineItemLike): boolean {
  return li.kind === "COMPLIMENTARY";
}

export interface InvoiceRates {
  /** Discount percentage, e.g. 10 for 10%. */
  discountRate?: number | string | null;
  /** Tax percentage, e.g. 8.5 for 8.5%. */
  taxRate?: number | string | null;
}

export interface InvoiceTotalBreakdown {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  /** What the complimentary lines would have cost at full price. */
  complimentaryValue: number;
  /** The token actually charged for them. */
  complimentaryCharged: number;
  /** complimentaryValue - complimentaryCharged: shown to the client as a discount. */
  goodwillDiscount: number;
}

function toFloat(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute invoice totals from line items + rates.
 *
 * subtotal   = Σ(qty × unitPrice)
 * discount   = subtotal × discountRate%
 * taxable    = subtotal − discount
 * tax        = taxable  × taxRate%
 * total      = taxable  + tax
 *
 * `discountRate` / `taxRate` are expressed as percentages (0–100).
 */
export function calcInvoiceTotal(
  lineItems: InvoiceLineItemLike[],
  rates: InvoiceRates = {},
): InvoiceTotalBreakdown {
  const free = lineItems.filter(isComplimentary);
  const billed = lineItems.filter((li) => !isComplimentary(li) && !li.isFree);

  const subtotal = billed.reduce((s, li) => s + toFloat(li.quantity) * toFloat(li.unitPrice), 0);

  // Complimentary work carries its real worth so the client can see what was
  // given away, and is charged the token so the invoice still adds up to what
  // is actually owed.
  const complimentaryValue = free.reduce((s, li) => s + toFloat(li.quantity) * toFloat(li.unitPrice), 0);
  const complimentaryCharged = free.reduce((s, li) => s + toFloat(li.quantity) * COMPLIMENTARY_TOKEN, 0);
  const goodwillDiscount = Math.max(0, complimentaryValue - complimentaryCharged);

  const discountPct = toFloat(rates.discountRate);
  const taxPct = toFloat(rates.taxRate);
  const discount = subtotal * (discountPct / 100);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxPct / 100);
  const total = taxable + tax + complimentaryCharged;
  return {
    subtotal, discount, taxable, tax, total,
    complimentaryValue, complimentaryCharged, goodwillDiscount,
  };
}

// ── What is still owed ────────────────────────────────────────────────────
//
// InvoiceStatus has no partial state, and adding one means an enum migration
// against a live database. Part payment is derivable from the receipts already
// recorded against the invoice, so it is derived rather than stored — there is
// no second copy of the truth to fall out of step with the receipts.

export interface InvoiceBalance {
  total: number;
  paid: number;
  /** Never negative: an overpayment is not a negative amount owed. */
  balance: number;
  state: "unpaid" | "partial" | "paid" | "overpaid";
  /** Paid as a fraction of the total, 0-1, for a progress bar. */
  fraction: number;
}

export function calcInvoiceBalance(
  total: number,
  payments: { amount: number | string }[] = [],
): InvoiceBalance {
  const paid = payments.reduce((s, p) => s + toFloat(p.amount), 0);
  const t = round2(total);
  const p = round2(paid);

  const state: InvoiceBalance["state"] =
    p <= 0 ? "unpaid"
    : p > t ? "overpaid"
    : p >= t ? "paid"
    : "partial";

  return {
    total: t,
    paid: p,
    balance: Math.max(0, round2(t - p)),
    state,
    fraction: t > 0 ? Math.min(1, p / t) : 0,
  };
}

/** Currency arithmetic in floats drifts; figures that leave here are rounded. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
