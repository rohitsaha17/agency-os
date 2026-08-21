"use client";

/**
 * v3 Phase 6 — the close-cycle wizard (docs/V3_CONTEXT.md §3).
 *
 *   1. Summary   what the cycle actually did
 *   2. Carry     what didn't go out, and where it goes
 *   3. Billing   over-delivery: bill it or gift it
 *   4. Confirm   lock the cycle and produce the billing lines
 *
 * Not one amount appears anywhere in here. The SMM decides WHETHER something
 * bills; their manager decides for how much.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, X, ArrowRightCircle, Trash2,
  IndianRupee, Gift, CheckCircle2, AlertTriangle, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";

interface QuotaRow {
  creativeType: { id: string; name: string; icon: string | null };
  quota: number; planned: number; posted: number;
  extra: number; carriedInExtra: number; carriedInQuota: number;
}

interface CloseItem {
  id: string;
  topic: string;
  date: string;
  status: string;
  description: string | null;
  referenceUrl: string | null;
  creativeType: { id: string; name: string; icon: string | null };
  tasks: { id: string; status: string; assignees: { user: { name: string } }[] }[];
}

interface CloseData {
  cycle: {
    id: string; label: string; status: string;
    startDate: string; endDate: string;
    project: { id: string; name: string; clientId: string; client: { name: string } };
  };
  summary: { perType: QuotaRow[]; totals: { quota: number; planned: number; posted: number; extra: number; missed: number } } | null;
  unposted: CloseItem[];
  extras: CloseItem[];
  posted: number;
}

type CarryChoice = "INSIDE_QUOTA" | "ABOVE_QUOTA" | "DROP";

const STEPS = ["Summary", "Carry forward", "Extras", "Confirm"];

export function CloseCycleWizard({
  cycleId, onClose, onClosed,
}: {
  cycleId: string;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [data, setData] = useState<CloseData | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decisions, keyed by item. Carrying inside the quota is the kind default:
  // the client is owed the work either way.
  const [carry, setCarry] = useState<Record<string, CarryChoice>>({});
  const [dropReason, setDropReason] = useState<Record<string, string>>({});
  const [intent, setIntent] = useState<Record<string, "BILL" | "FREE">>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/cycles/${cycleId}/close`);
    if (!res.ok) { setError("Couldn't load this cycle"); return; }
    const d: CloseData = await res.json();
    setData(d);
    setCarry(Object.fromEntries(d.unposted.map((i) => [i.id, "INSIDE_QUOTA" as CarryChoice])));
    setIntent(Object.fromEntries(d.extras.map((i) => [i.id, "BILL" as const])));
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  const confirm = async () => {
    if (!data) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carry: data.unposted.map((i) => {
            const choice = carry[i.id] ?? "INSIDE_QUOTA";
            return choice === "DROP"
              ? { itemId: i.id, action: "DROP", reason: dropReason[i.id] }
              : { itemId: i.id, action: "CARRY", carryMode: choice };
          }),
          extras: data.extras.map((i) => ({ itemId: i.id, intent: intent[i.id] ?? "BILL" })),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || "Couldn't close the cycle");
      toast.success(
        `${data.cycle.label} closed`,
      );
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  if (!data) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8">
          {error ? (
            <p className="text-sm text-red-600 text-center">{error}</p>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  const carryCount = data.unposted.filter((i) => (carry[i.id] ?? "INSIDE_QUOTA") !== "DROP").length;
  const dropCount = data.unposted.length - carryCount;
  const billCount = data.extras.filter((i) => (intent[i.id] ?? "BILL") === "BILL").length;
  const freeCount = data.extras.length - billCount;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header + step rail */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Close {data.cycle.label}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {data.cycle.project.client.name} · {data.cycle.project.name}
              </p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                  i === step ? "bg-indigo-600 text-white font-medium"
                  : i < step ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-400"
                }`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 1. Summary ── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                What this cycle actually did, per deliverable.
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto -mx-1 px-1"><table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">Deliverable</th>
                      <th className="text-center px-2 py-2 font-medium">Quota</th>
                      <th className="text-center px-2 py-2 font-medium">Planned</th>
                      <th className="text-center px-2 py-2 font-medium">Posted</th>
                      <th className="text-center px-2 py-2 font-medium">Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.summary?.perType ?? []).map((r) => {
                      // Everything committed this cycle, extras included, so
                      // "posted" is always a subset of "planned" rather than
                      // mysteriously exceeding it.
                      const committed = r.planned + r.extra + r.carriedInExtra;
                      const notPosted = Math.max(0, committed - r.posted);
                      return (
                        <tr key={r.creativeType.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-800">
                            {r.creativeType.icon && <span className="mr-1">{r.creativeType.icon}</span>}
                            {r.creativeType.name}
                            {notPosted > 0 && (
                              <span className="text-gray-400"> · {notPosted} not posted</span>
                            )}
                          </td>
                          <td className="text-center px-2 py-2 tabular-nums text-gray-600">{r.quota || "—"}</td>
                          <td className="text-center px-2 py-2 tabular-nums text-gray-800">{committed}</td>
                          <td className="text-center px-2 py-2 tabular-nums text-emerald-600 font-medium">{r.posted}</td>
                          <td className="text-center px-2 py-2 tabular-nums text-amber-600">
                            {r.extra + r.carriedInExtra || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span><b className="text-gray-800">{data.unposted.length}</b> still unposted</span>
                <span><b className="text-amber-600">{data.extras.length}</b> over-delivered</span>
                {(data.summary?.totals.missed ?? 0) > 0 && (
                  <span><b className="text-red-500">{data.summary!.totals.missed}</b> already missed</span>
                )}
              </div>
            </div>
          )}

          {/* ── 2. Carry forward ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                These didn&rsquo;t go out. Carrying one copies every detail into the next
                cycle — topic, brief and reference — so nothing is retyped.
              </p>
              {data.unposted.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Everything went out. Nothing to carry.</p>
                </div>
              ) : data.unposted.map((i) => {
                const choice = carry[i.id] ?? "INSIDE_QUOTA";
                return (
                  <div key={i.id} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">
                          {i.creativeType.icon && <span className="mr-1">{i.creativeType.icon}</span>}
                          {i.topic}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(i.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                          {" · "}{i.status.toLowerCase().replace(/_/g, " ")}
                          {i.tasks[0]?.assignees[0] && ` · ${i.tasks[0].assignees[0].user.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {([
                        ["INSIDE_QUOTA", "Inside next cycle's quota", <ArrowRightCircle key="a" className="w-3 h-3" />],
                        ["ABOVE_QUOTA", "Over and above", <ArrowRightCircle key="b" className="w-3 h-3" />],
                        ["DROP", "Drop", <Trash2 key="c" className="w-3 h-3" />],
                      ] as const).map(([value, label, icon]) => (
                        <button key={value} type="button"
                          onClick={() => setCarry((c) => ({ ...c, [i.id]: value }))}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                            choice === value
                              ? value === "DROP"
                                ? "border-red-300 bg-red-50 text-red-700 font-medium"
                                : "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                              : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}>
                          {icon} {label}
                        </button>
                      ))}
                    </div>
                    {choice === "DROP" && (
                      <input
                        value={dropReason[i.id] ?? ""}
                        onChange={(e) => setDropReason((r) => ({ ...r, [i.id]: e.target.value }))}
                        placeholder="Why was it dropped? (recommended)"
                        className="mt-2 w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 3. Extras ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">
                  You decide whether these bill. <b className="text-gray-700">Pricing is set by your manager</b>,
                  so no amounts appear here.
                </p>
              </div>
              {data.extras.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No over-delivery this cycle.</p>
                </div>
              ) : data.extras.map((i) => {
                const choice = intent[i.id] ?? "BILL";
                return (
                  <div key={i.id} className="border border-gray-200 rounded-xl p-3">
                    <p className="text-sm text-gray-900">
                      {i.creativeType.icon && <span className="mr-1">{i.creativeType.icon}</span>}
                      {i.topic}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(i.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      {" · "}{i.creativeType.name}
                    </p>
                    <div className="flex gap-1.5 mt-2.5">
                      <button type="button" onClick={() => setIntent((s) => ({ ...s, [i.id]: "BILL" }))}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                          choice === "BILL"
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}>
                        <IndianRupee className="w-3 h-3" /> Bill this separately
                      </button>
                      <button type="button" onClick={() => setIntent((s) => ({ ...s, [i.id]: "FREE" }))}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                          choice === "FREE"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}>
                        <Gift className="w-3 h-3" /> Complimentary
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 4. Confirm ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900">
                  Closing locks {data.cycle.label} for planning. Only a manager can reopen it,
                  and doing so is recorded.
                </p>
              </div>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <b>{data.posted}</b> posted this cycle
                </li>
                {carryCount > 0 && (
                  <li className="flex items-center gap-2">
                    <ArrowRightCircle className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <b>{carryCount}</b> carried into the next cycle, details and all
                  </li>
                )}
                {dropCount > 0 && (
                  <li className="flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <b>{dropCount}</b> dropped
                  </li>
                )}
                {billCount > 0 && (
                  <li className="flex items-center gap-2">
                    <IndianRupee className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <b>{billCount}</b> extra{billCount === 1 ? "" : "s"} sent to your manager to price
                  </li>
                )}
                {freeCount > 0 && (
                  <li className="flex items-center gap-2">
                    <Gift className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <b>{freeCount}</b> given complimentary
                  </li>
                )}
              </ul>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button size="sm" loading={saving} onClick={confirm}>Close cycle</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
