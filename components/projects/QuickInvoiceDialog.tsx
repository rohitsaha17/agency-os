"use client";

/**
 * Raise an invoice for a project without leaving the project.
 *
 * The Invoices tab used to be a read-only list with three links out to
 * /invoices, where you had to find the client and the project again and
 * retype what the project already knows. Billing usually happens while
 * you're looking at the project, so it happens here.
 *
 * It also captures a payment in the same step, because the common case is
 * "bill the cycle up front and take an advance" — two screens for one
 * decision. The payment is a separate Receipt row, so a part payment is
 * recorded as what it is: money received against an invoice, not a status
 * flag on the invoice.
 */

import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, IndianRupee } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { calcInvoiceTotal, calcInvoiceBalance, formatMoney } from "@/lib/format";
import { todayKey } from "@/lib/date-key";
import {
  raiseInvoice, PartialInvoiceError, cycleLineDescription, inSevenDays,
} from "@/lib/invoice-draft";
import type { ProjectDeliverable } from "@/types";

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  project: {
    id: string;
    name: string;
    clientId: string;
    currency?: string;
    cycleAmount?: string | number | null;
    cycleStartDate?: string | null;
    cycleEndDate?: string | null;
    serviceType?: string | null;
    deliverables?: ProjectDeliverable[];
  };
}

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

export function QuickInvoiceDialog({ open, onClose, onCreated, project }: Props) {
  const currency = project.currency ?? "INR";
  const cycleAmount = project.cycleAmount != null ? String(project.cycleAmount) : "";

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [dueDate, setDueDate] = useState(inSevenDays());
  const [discountPct, setDiscountPct] = useState("");
  const [taxPct, setTaxPct] = useState("");
  const [notes, setNotes] = useState("");
  const [issueNow, setIssueNow] = useState(true);

  const [takePayment, setTakePayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayKey());
  const [payMethod, setPayMethod] = useState("BANK_TRANSFER");
  const [payReference, setPayReference] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a fresh prefill each time it opens, so a cancelled attempt
  // doesn't leave half-typed lines behind for the next one.
  useEffect(() => {
    if (!open) return;
    setLines([
      { description: cycleLineDescription(project), quantity: "1", unitPrice: cycleAmount },
    ]);
    setDueDate(inSevenDays());
    setDiscountPct("");
    setTaxPct("");
    setNotes("");
    setIssueNow(true);
    setTakePayment(false);
    setPayAmount("");
    setPayDate(todayKey());
    setPayMethod("BANK_TRANSFER");
    setPayReference("");
    setError(null);
    // Prefill depends only on which project this is, not on every field of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.id]);

  const totals = useMemo(
    () => calcInvoiceTotal(lines, { discountRate: discountPct, taxRate: taxPct }),
    [lines, discountPct, taxPct],
  );

  const paidNow = takePayment ? parseFloat(payAmount) || 0 : 0;
  const balance = calcInvoiceBalance(totals.total, paidNow > 0 ? [{ amount: paidNow }] : []);

  const money = (n: number) => formatMoney(n, currency, { precision: 0 });

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const canSave =
    lines.length > 0 &&
    lines.every((l) => l.description.trim()) &&
    totals.total > 0 &&
    !saving;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await raiseInvoice({
        clientId: project.clientId,
        projectId: project.id,
        currency,
        dueDate,
        discountPct,
        taxPct,
        notes,
        issueNow,
        lines: lines.map((l) => ({
          description: l.description.trim(),
          quantity: parseFloat(l.quantity) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
        })),
        payment: paidNow > 0
          ? { amount: paidNow, receivedAt: payDate, method: payMethod, reference: payReference }
          : null,
      });

      onCreated();
      onClose();
    } catch (e) {
      if (e instanceof PartialInvoiceError) {
        // The invoice landed; only the receipt didn't. Refresh so it shows.
        onCreated();
      }
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /**
   * No width here on purpose. This used to start with `w-full`, and Tailwind
   * resolves conflicting utilities by stylesheet order, not by the order you
   * wrote them — so `${inputCls} w-16` on the quantity field rendered at full
   * width and shoved the delete button off the side of a phone. Each use site
   * states its own width.
   */
  const inputCls =
    "min-w-0 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New invoice"
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            {paidNow > 0 ? "Create and record payment" : issueNow ? "Create and issue" : "Save draft"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-xs text-gray-500 dark:text-slate-400 -mt-1">
          For <span className="font-medium text-gray-700 dark:text-slate-200">{project.name}</span>
          {cycleAmount && <> · prefilled with the agreed {money(parseFloat(cycleAmount))} per cycle</>}
        </p>

        {/* Line items */}
        <div>
          <label className={labelCls}>What is being billed</label>
          <div className="space-y-2">
            {lines.map((line, i) => (
              // Four controls on one row needs ~300px of fixed width before
              // the description gets any, which does not exist on a phone.
              // Description on its own line, the numbers beneath it.
              <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 rounded-lg sm:rounded-none border sm:border-0 border-gray-200 dark:border-white/[0.08] p-2 sm:p-0">
                <input
                  className={`${inputCls} w-full`}
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
                <div className="flex items-start gap-2">
                  <input
                    className={`${inputCls} w-16 shrink-0 text-center`}
                    inputMode="decimal"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />
                  <input
                    className={`${inputCls} flex-1 sm:flex-none sm:w-28 text-right`}
                    inputMode="decimal"
                    placeholder="Amount"
                    value={line.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    disabled={lines.length === 1}
                    className="p-2 shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((p) => [...p, { description: "", quantity: "1", unitPrice: "" }])}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add a line
          </button>
        </div>

        {/* Rates and due date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="min-w-0">
            <label className={labelCls}>Due date</label>
            <input type="date" className={`${inputCls} w-full`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className={labelCls}>Discount %</label>
            <input className={`${inputCls} w-full`} inputMode="decimal" placeholder="0" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className={labelCls}>Tax %</label>
            <input className={`${inputCls} w-full`} inputMode="decimal" placeholder="0" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
          </div>
        </div>

        {/* Payment received now — the advance */}
        <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
          <label className="flex items-center gap-2.5 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-white/[0.02]">
            <input
              type="checkbox"
              checked={takePayment}
              onChange={(e) => {
                setTakePayment(e.target.checked);
                // Most advances are the full amount; typing over it is easier
                // than typing it from scratch.
                if (e.target.checked && !payAmount) setPayAmount(String(Math.round(totals.total)));
              }}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/40"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
              Payment received now
            </span>
            <span className="text-xs text-gray-400">advance or part payment</span>
          </label>

          {takePayment && (
            <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-200 dark:border-white/[0.08]">
              <div className="min-w-0">
                <label className={labelCls}>Amount</label>
                <div className="relative">
                  <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    className={`${inputCls} w-full pl-8`}
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Received on</label>
                <input type="date" className={`${inputCls} w-full`} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Method</label>
                <Select value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS} className="w-full" />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>Reference</label>
                <input
                  className={`${inputCls} w-full`}
                  placeholder="UTR / cheque no."
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Notes on the invoice</label>
          <textarea
            className={`${inputCls} w-full resize-none`}
            rows={2}
            placeholder="Optional — payment terms, bank details, anything the client should see"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Totals */}
        <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] px-4 py-3 space-y-1.5 text-sm">
          <Row label="Subtotal" value={money(totals.subtotal)} />
          {totals.discount > 0 && <Row label={`Discount (${discountPct}%)`} value={`− ${money(totals.discount)}`} />}
          {totals.tax > 0 && <Row label={`Tax (${taxPct}%)`} value={money(totals.tax)} />}
          <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-white/[0.08]">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Invoice total</span>
            <span className="font-semibold text-gray-900 dark:text-slate-100">{money(totals.total)}</span>
          </div>
          {paidNow > 0 && (
            <>
              <Row label="Paid now" value={`− ${money(balance.paid)}`} tone="text-emerald-600 dark:text-emerald-400" />
              <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-white/[0.08]">
                <span className="font-semibold text-gray-900 dark:text-slate-100">Balance due</span>
                <span className={`font-semibold ${balance.balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {money(balance.balance)}
                </span>
              </div>
            </>
          )}
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={issueNow}
            onChange={(e) => setIssueNow(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/40"
          />
          <span className="text-sm text-gray-700 dark:text-slate-300">
            Issue it now <span className="text-xs text-gray-400">— otherwise it is saved as a draft</span>
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
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
