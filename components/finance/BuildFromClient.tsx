"use client";

/**
 * v3 Phase 7 — building an invoice from what actually happened.
 *
 * Everything a client can still be billed for, grouped by project and cycle,
 * each line ticked by default. Untick to leave it for a later invoice; it
 * stays available rather than disappearing (docs/V3_CONTEXT.md §3).
 *
 * Anything still awaiting a price is shown greyed rather than hidden —
 * work an admin hasn't got to yet should be visible, just not billable.
 */

import { useState, useEffect, useCallback } from "react";
import { Gift, IndianRupee, AlertCircle, Layers } from "lucide-react";
import { formatMoney } from "@/lib/money";

export interface BuiltLine {
  description: string;
  quantity: number;
  unitPrice: number;
  kind: "PACKAGE" | "EXTRA" | "COMPLIMENTARY" | "ADHOC_TASK" | "CUSTOM";
  isFree: boolean;
  contentItemId: string | null;
  billableItemId: string;
}

interface BillableItem {
  id: string;
  label: string;
  kind: "PACKAGE" | "EXTRA" | "COMPLIMENTARY" | "ADHOC_TASK";
  amount: string | number | null;
  status: "PENDING_PRICING" | "READY" | "INVOICED" | "WAIVED";
  contentItem: { id: string; topic: string } | null;
  flaggedBy: { id: string; name: string } | null;
}

interface Group {
  key: string;
  projectId: string | null;
  projectName: string;
  cycleLabel: string | null;
  items: BillableItem[];
}

const KIND_CHIP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  PACKAGE:       { label: "Retainer",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",     icon: null },
  EXTRA:         { label: "Extra",         cls: "bg-amber-50 text-amber-700 border-amber-200",        icon: <IndianRupee className="w-2.5 h-2.5" /> },
  COMPLIMENTARY: { label: "Complimentary", cls: "bg-emerald-50 text-emerald-700 border-emerald-200",  icon: <Gift className="w-2.5 h-2.5" /> },
  ADHOC_TASK:    { label: "Ad-hoc",        cls: "bg-sky-50 text-sky-700 border-sky-200",              icon: null },
};

export function BuildFromClient({
  clientId, currency, onLines,
}: {
  clientId: string;
  currency: string;
  /** Fires whenever the selection or an amount changes. */
  onLines: (lines: BuiltLine[], currency: string) => void;
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [needsPricing, setNeedsPricing] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!clientId) { setGroups(null); return; }
    const res = await fetch(`/api/invoices/build-from-client?clientId=${clientId}`);
    if (!res.ok) { setGroups([]); return; }
    const d = await res.json();
    setGroups(d.groups);
    setNeedsPricing(d.needsPricing);
    // Ticked by default — the common case is billing everything outstanding.
    const all = d.groups.flatMap((g: Group) => g.items);
    setTicked(Object.fromEntries(all.map((i: BillableItem) => [i.id, i.status === "READY"])));
    setAmounts(Object.fromEntries(
      all.map((i: BillableItem) => [i.id, i.amount != null ? String(i.amount) : ""]),
    ));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Push the current selection up whenever anything changes.
  useEffect(() => {
    if (!groups) return;
    const lines: BuiltLine[] = groups
      .flatMap((g) => g.items)
      .filter((i) => ticked[i.id] && i.status === "READY")
      .map((i) => ({
        description: i.label,
        quantity: 1,
        unitPrice: parseFloat(amounts[i.id] || "0") || 0,
        kind: i.kind,
        isFree: i.kind === "COMPLIMENTARY",
        contentItemId: i.contentItem?.id ?? null,
        billableItemId: i.id,
      }));
    onLines(lines, currency);
    // onLines is a fresh closure each render in most parents; depending on it
    // would loop. The selection state is what actually matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, ticked, amounts, currency]);

  if (groups === null) {
    return <p className="text-xs text-gray-400 py-3">Pick a client to see what can be billed.</p>;
  }
  if (groups.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
        <Layers className="w-7 h-7 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Nothing outstanding for this client.</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Closing a cycle is what produces billable lines.
        </p>
      </div>
    );
  }

  const selected = groups.flatMap((g) => g.items).filter((i) => ticked[i.id] && i.status === "READY");
  const total = selected
    .filter((i) => i.kind !== "COMPLIMENTARY")
    .reduce((s, i) => s + (parseFloat(amounts[i.id] || "0") || 0), 0);

  return (
    <div className="space-y-3">
      {needsPricing > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            {needsPricing} item{needsPricing === 1 ? "" : "s"} still {needsPricing === 1 ? "needs" : "need"} pricing
            and can&rsquo;t be billed yet. Set an amount on the Invoices page to release {needsPricing === 1 ? "it" : "them"}.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700">
              {g.projectName}
              {g.cycleLabel && <span className="font-normal text-gray-400"> · {g.cycleLabel}</span>}
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {g.items.map((i) => {
              const chip = KIND_CHIP[i.kind] ?? KIND_CHIP.EXTRA;
              const pending = i.status === "PENDING_PRICING";
              return (
                <div key={i.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 ${pending ? "bg-gray-50/70" : ""}`}>
                  <input type="checkbox"
                    checked={!pending && !!ticked[i.id]}
                    disabled={pending}
                    onChange={() => setTicked((t) => ({ ...t, [i.id]: !t[i.id] }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40" />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${pending ? "text-gray-400" : "text-gray-800"}`}>
                      {i.label}
                    </p>
                    {i.flaggedBy && (
                      <p className="text-[11px] text-gray-400">flagged by {i.flaggedBy.name}</p>
                    )}
                  </div>

                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 flex-shrink-0 ${chip.cls}`}>
                    {chip.icon}{chip.label}
                  </span>

                  {pending ? (
                    <span className="text-xs text-amber-600 flex-shrink-0 w-28 text-right">needs pricing</span>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[11px] text-gray-400">{currency}</span>
                      <input type="number" min="0" step="0.01"
                        value={amounts[i.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))}
                        disabled={!ticked[i.id]}
                        className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
        <span className="text-gray-500">
          {selected.length} line{selected.length === 1 ? "" : "s"} selected
        </span>
        <span className="font-semibold text-gray-900">
          {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}
