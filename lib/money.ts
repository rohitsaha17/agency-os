// v2 money helpers — thin layer over the canonical formatter in lib/format.
//
// Rule (docs/V2_CONTEXT.md): a client may override the organization currency;
// everything rendered in a client's scope uses resolveClientCurrency, while
// org-wide aggregates keep the organization currency.

import { formatMoney as baseFormatMoney, FormatMoneyOpts } from "@/lib/format";

export interface HasCurrency {
  currency?: string | null;
}

/** Client currency if set, else the organization currency, else USD. */
export function resolveClientCurrency(
  client: HasCurrency | null | undefined,
  org: HasCurrency | null | undefined,
): string {
  return client?.currency || org?.currency || "USD";
}

/**
 * Format a monetary value. Same contract as lib/format's formatMoney but the
 * currency argument is optional-first so call sites read naturally:
 *   formatMoney(total, resolveClientCurrency(client, org))
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  opts?: FormatMoneyOpts,
): string {
  return baseFormatMoney(amount, currency || "USD", opts);
}
