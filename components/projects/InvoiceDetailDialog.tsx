"use client";

/**
 * One invoice, opened where you found it.
 *
 * "View" on a project's invoice row used to link to /invoices — the whole
 * list, with no filter and no anchor, so you arrived and had to find the same
 * invoice again by number. Same shape of problem as having to leave the
 * project to raise one. This opens it in place, with the one thing you
 * normally came to do: record a payment against it.
 */

import { useState } from "react";
import { IndianRupee, FileText, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  calcInvoiceTotal, calcInvoiceBalance, COMPLIMENTARY_TOKEN, isComplimentary,
} from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { todayKey } from "@/lib/date-key";
import type { Invoice } from "@/types";

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onChanged: () => void;
}

export function InvoiceDetailDialog({ invoice, onClose, onChanged }: Props) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  /**
   * The PDF is built in the browser, not served from a route — same path the
   * invoices page uses, imported lazily so the print templates aren't in the
   * bundle for everyone who only ever looks at a project.
   */
  async function downloadPdf() {
    if (!invoice) return;
    setPdfBusy(true);
    setError(null);
    try {
      const [{ fetchSettings, openPrintPdf }, { buildInvoiceHtml }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdfTemplates"),
      ]);
      const settings = await fetchSettings();
      await openPrintPdf(buildInvoiceHtml(
        { ...invoice, client: invoice.client ?? null, project: invoice.project ?? null },
        settings,
      ));
    } catch {
      setError("Could not generate the PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!invoice) return null;

  const currency = invoice.currency;
  const money = (n: number) => formatMoney(n, currency, { precision: 0 });
  const totals = calcInvoiceTotal(invoice.lineItems, {
    discountRate: invoice.discountPct, taxRate: invoice.taxPct,
  });
  const bal = calcInvoiceBalance(totals.total, invoice.receipts ?? []);

  async function recordPayment() {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { setError("Enter an amount greater than zero"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: invoice!.clientId,
          invoiceId: invoice!.id,
          amount: amt,
          currency,
          receivedAt: date,
          method,
          reference: reference.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || d.error || "Could not record the payment");
      }
      // Settling the last of it closes the invoice; a part payment leaves it
      // open, and the balance is derived from the receipts either way.
      if (amt >= bal.balance) {
        await fetch(`/api/invoices/${invoice!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAID", paidAt: new Date().toISOString() }),
        }).catch(() => {});
      }
      setRecording(false);
      setAmount("");
      setReference("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full min-w-0 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5";

  const statusLabel =
    bal.state === "partial" && invoice.status !== "CANCELLED"
      ? "Part paid"
      : invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase();

  return (
    <Modal
      open
      onClose={onClose}
      title={invoice.invoiceNumber}
      width="max-w-2xl"
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            bal.state === "partial" ? "bg-amber-50 text-amber-700"
            : invoice.status === "PAID" ? "bg-emerald-50 text-emerald-700"
            : invoice.status === "OVERDUE" ? "bg-red-50 text-red-700"
            : invoice.status === "SENT" ? "bg-blue-50 text-blue-700"
            : "bg-gray-100 text-gray-600"
          }`}>
            {statusLabel}
          </span>
          {invoice.dueDate && (
            <span className="text-xs text-gray-500 dark:text-slate-400">
              Due {new Date(invoice.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
          <button
            onClick={downloadPdf}
            disabled={pdfBusy}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" /> {pdfBusy ? "Preparing…" : "PDF"}
          </button>
        </div>

        {/* Lines */}
        <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {invoice.lineItems.map((li) => {
                const gift = isComplimentary(li);
                const worth = li.quantity * li.unitPrice;
                return (
                  <tr key={li.id}>
                    <td className="px-4 py-2.5 text-gray-800 dark:text-slate-200">
                      {li.description}
                      {li.quantity !== 1 && (
                        <span className="text-xs text-gray-400"> × {li.quantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {gift ? (
                        // Show what it was worth and what is actually charged,
                        // so the goodwill is visible rather than a bare token.
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {worth > COMPLIMENTARY_TOKEN && (
                            <span className="line-through text-gray-400 mr-1.5">{money(worth)}</span>
                          )}
                          {money(li.quantity * COMPLIMENTARY_TOKEN)}
                        </span>
                      ) : (
                        <span className="text-gray-900 dark:text-slate-100">{money(worth)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] px-4 py-3 space-y-1.5 text-sm">
          <Row label="Subtotal" value={money(totals.subtotal)} />
          {totals.discount > 0 && <Row label={`Discount (${invoice.discountPct}%)`} value={`− ${money(totals.discount)}`} />}
          {totals.tax > 0 && <Row label={`Tax (${invoice.taxPct}%)`} value={money(totals.tax)} />}
          {totals.goodwillDiscount > 0 && (
            <>
              <Row label="Complimentary work" value={money(totals.complimentaryValue)} />
              <Row label="Goodwill discount" value={`− ${money(totals.goodwillDiscount)}`} tone="text-emerald-600 dark:text-emerald-400" />
            </>
          )}
          <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-white/[0.08]">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Total</span>
            <span className="font-semibold text-gray-900 dark:text-slate-100">{money(totals.total)}</span>
          </div>
        </div>

        {/* Payments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Payments</p>
            {bal.balance > 0 && !recording && (
              <button
                onClick={() => { setRecording(true); setAmount(String(Math.round(bal.balance))); }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Record a payment
              </button>
            )}
          </div>

          {(invoice.receipts ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">Nothing received yet.</p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {(invoice.receipts ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-slate-400 text-xs">
                    {new Date(r.receivedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {r.method && <> · {r.method.replace(/_/g, " ").toLowerCase()}</>}
                    {r.reference && <> · {r.reference}</>}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {money(Number(r.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-white/[0.08] text-sm">
            <span className="font-semibold text-gray-900 dark:text-slate-100">
              {bal.balance > 0 ? "Balance due" : "Settled"}
            </span>
            <span className={`font-semibold ${bal.balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {bal.balance > 0 ? money(bal.balance) : <Check className="w-4 h-4 inline" />}
            </span>
          </div>

          {recording && (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className={labelCls}>Amount</label>
                <div className="relative">
                  <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input className={`${inputCls} pl-8`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                {parseFloat(amount) > 0 && parseFloat(amount) < bal.balance && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    {money(bal.balance - parseFloat(amount))} will remain outstanding.
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Received on</label>
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Method</label>
                <Select value={method} onChange={setMethod} options={PAYMENT_METHODS} className="w-full" />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Reference</label>
                <input className={inputCls} placeholder="UTR / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRecording(false)} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={recordPayment} loading={saving}>Record payment</Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

    </Modal>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className={tone ?? "text-gray-700 dark:text-slate-300"}>{value}</span>
    </div>
  );
}
