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
  /** v2: complimentary lines are excluded from totals */
  isFree?: boolean;
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
  const subtotal = lineItems.reduce(
    (s, li) => (li.isFree ? s : s + toFloat(li.quantity) * toFloat(li.unitPrice)),
    0,
  );
  const discountPct = toFloat(rates.discountRate);
  const taxPct = toFloat(rates.taxRate);
  const discount = subtotal * (discountPct / 100);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxPct / 100);
  const total = taxable + tax;
  return { subtotal, discount, taxable, tax, total };
}
