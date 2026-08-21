"use client";

/**
 * v3 Phase 6 — the handoff from "someone flagged this" to "it has a price".
 *
 * An SMM closing a cycle says WHETHER an extra bills; they never see or set
 * an amount. This card is where the other half happens: a manager types the
 * number and the item becomes invoiceable (docs/V3_CONTEXT.md §3).
 */

import { useState, useEffect, useCallback } from "react";
import { IndianRupee, Gift, Check, X, AlertCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { COMPLIMENTARY_TOKEN } from "@/lib/format";
import { toast } from "@/lib/toast";

interface BillableItem {
  id: string;
  label: string;
  kind: "PACKAGE" | "EXTRA" | "COMPLIMENTARY" | "ADHOC_TASK";
  amount: string | number | null;
  status: "PENDING_PRICING" | "READY" | "INVOICED" | "WAIVED";
  client: { id: string; name: string };
  project: { id: string; name: string } | null;
  cycle: { id: string; label: string } | null;
  flaggedBy: { id: string; name: string } | null;
}

const KIND_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  PACKAGE:       { label: "Retainer",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: null },
  EXTRA:         { label: "Extra",         cls: "bg-amber-50 text-amber-700 border-amber-200",    icon: <IndianRupee className="w-2.5 h-2.5" /> },
  COMPLIMENTARY: { label: "Complimentary", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Gift className="w-2.5 h-2.5" /> },
  ADHOC_TASK:    { label: "Ad-hoc",        cls: "bg-sky-50 text-sky-700 border-sky-200",          icon: null },
};

export function NeedsPricingCard({ currency = "USD" }: { currency?: string }) {
  const [items, setItems] = useState<BillableItem[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/billable-items?status=PENDING_PRICING");
    setItems(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const price = async (id: string) => {
    const amount = draft[id];
    if (!amount || !Number.isFinite(parseFloat(amount))) {
      toast.error("Enter an amount");
      return;
    }
    setSaving(id);
    try {
      const res = await fetch(`/api/billable-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) { toast.error("Couldn't save that amount"); return; }
      toast.success("Set — ready to invoice");
      setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
      load();
    } finally { setSaving(null); }
  };

  const waive = async (id: string) => {
    const res = await fetch(`/api/billable-items/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Waived"); load(); }
    else toast.error("Couldn't waive that item");
  };

  // Nothing waiting is the normal state — don't take up room saying so.
  if (items === null || items.length === 0) return null;

  return (
    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden mb-5">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {items.length} item{items.length === 1 ? "" : "s"} need pricing
          </p>
          <p className="text-xs text-amber-700">
            Flagged at cycle close. On an extra the amount is what to charge;
            on a complimentary item it is what the work was worth — the client
            is charged {formatMoney(COMPLIMENTARY_TOKEN, currency, { precision: 0 })} and
            sees the rest as a goodwill discount.
          </p>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {items.map((it) => {
          const meta = KIND_META[it.kind] ?? KIND_META.EXTRA;
          const isGift = it.kind === "COMPLIMENTARY";
          const worth = parseFloat(draft[it.id] ?? "") || 0;
          return (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm text-gray-900">{it.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {it.client.name}
                  {it.cycle && <> · {it.cycle.label}</>}
                  {it.flaggedBy && <> · flagged by {it.flaggedBy.name}</>}
                </p>
              </div>

              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 flex-shrink-0 ${meta.cls}`}>
                {meta.icon}{meta.label}
              </span>

              {isGift && worth > COMPLIMENTARY_TOKEN && (
                <span className="text-[11px] text-emerald-700 flex-shrink-0 whitespace-nowrap">
                  shows as −{formatMoney(worth - COMPLIMENTARY_TOKEN, currency, { precision: 0 })} discount,
                  charged {formatMoney(COMPLIMENTARY_TOKEN, currency, { precision: 0 })}
                </span>
              )}

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-400 select-none">{currency}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={draft[it.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") price(it.id); }}
                  placeholder={isGift ? "worth" : "0.00"}
                  title={isGift
                    ? "What this was worth. The invoice charges the token and shows the rest as a discount."
                    : "What to charge for this extra."}
                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={() => price(it.id)} disabled={saving === it.id}
                  title="Save amount"
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => waive(it.id)} title="Waive — never bill this"
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
