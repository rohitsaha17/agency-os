"use client";

import { useState, useEffect, useCallback } from "react";
import { Package as PackageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";
import type { CreativeType } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

interface Pkg {
  id: string;
  name: string;
  startMonth: string;
  endMonth: string | null;
  billingAmount: number | string | null;
  currency: string | null;
  notes: string | null;
  isActive: boolean;
  quotas: { id: string; creativeTypeId: string; monthlyQty: number; creativeType: { id: string; name: string; icon: string | null } }[];
}

export function PackageTab({ clientId, clientCurrency }: { clientId: string; clientCurrency?: string | null }) {
  const { user: currentUser } = useCurrentUser();
  const canSeeMoney = !!currentUser && currentUser.role !== "MEMBER";
  const canEdit = currentUser?.role === "ADMIN" || currentUser?.role === "OWNER" || currentUser?.role === "MANAGER";
  // A null package currency means "inherit": package → client → organization.
  const resolveCurrency = (pkgCurrency: string | null) =>
    pkgCurrency || clientCurrency || currentUser?.organization?.currency || "USD";

  const [actives, setActives] = useState<Pkg[]>([]);
  const [history, setHistory] = useState<Pkg[]>([]);
  const [types, setTypes] = useState<CreativeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  // When set, saving deactivates THIS package and creates the new one.
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", startMonth: new Date().toISOString().slice(0, 7), endMonth: "",
    billingAmount: "", currency: clientCurrency ?? "", notes: "",
    quotas: {} as Record<string, string>,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, typesRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/package`),
        fetch("/api/creative-types"),
      ]);
      if (pkgRes.ok) {
        const d = await pkgRes.json();
        setActives(d.actives ?? (d.active ? [d.active] : []));
        setHistory(d.history ?? []);
      }
      if (typesRes.ok) setTypes(await typesRes.json());
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startEdit = (pkg?: Pkg) => {
    setReplaceTarget(pkg?.id ?? null);
    setForm({
      name: pkg?.name ?? "",
      startMonth: pkg?.startMonth?.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
      endMonth: pkg?.endMonth?.slice(0, 7) ?? "",
      billingAmount: pkg?.billingAmount != null ? String(pkg.billingAmount) : "",
      currency: pkg?.currency ?? clientCurrency ?? "",
      notes: pkg?.notes ?? "",
      quotas: Object.fromEntries((pkg?.quotas ?? []).map((q) => [q.creativeTypeId, String(q.monthlyQty)])),
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Package name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          startMonth: form.startMonth,
          endMonth: form.endMonth || null,
          billingAmount: form.billingAmount || null,
          currency: form.currency || null,
          notes: form.notes || null,
          quotas: Object.entries(form.quotas)
            .filter(([, v]) => Number(v) > 0)
            .map(([creativeTypeId, v]) => ({ creativeTypeId, monthlyQty: Number(v) })),
          replacePackageId: replaceTarget,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error?.message ?? "Save failed"); return; }
      toast.success("Package saved");
      setEditing(false);
      setReplaceTarget(null);
      fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (pkg: Pkg) => {
    if (!confirm(`Deactivate "${pkg.name}"? It moves to history; past months stay accounted.`)) return;
    const res = await fetch(`/api/clients/${clientId}/package`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: pkg.id, isActive: false }),
    });
    if (res.ok) { toast.success("Package deactivated"); fetchAll(); }
    else toast.error("Failed to deactivate");
  };

  const fmtMonth = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "open-ended";

  if (loading) {
    return <div className="space-y-3 max-w-2xl">{[1, 2].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Active packages — several can run at once (e.g. social + website);
          their quotas merge on the content-calendar meters. */}
      {!editing && (
        <>
          {actives.map((pkg) => (
            <div key={pkg.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <PackageIcon className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-gray-900">{pkg.name}</h3>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-200">ACTIVE</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {fmtMonth(pkg.startMonth)} → {fmtMonth(pkg.endMonth)}
                    {canSeeMoney && pkg.billingAmount != null && (
                      <> · <span className="font-semibold text-gray-700">{formatMoney(Number(pkg.billingAmount), resolveCurrency(pkg.currency), { precision: 0 })}/mo</span></>
                    )}
                  </p>
                  {pkg.notes && <p className="text-xs text-gray-500 mt-1.5">{pkg.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(pkg)}>Replace</Button>
                    <button onClick={() => deactivate(pkg)}
                      className="text-xs text-gray-400 hover:text-red-500 underline underline-offset-2">
                      Deactivate
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {pkg.quotas.map((q) => (
                  <div key={q.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-sm">{q.creativeType.icon ?? "✨"}</span>
                    <span className="text-xs text-gray-600 flex-1">{q.creativeType.name}</span>
                    <span className="text-sm font-bold text-gray-900">{q.monthlyQty}<span className="text-[10px] font-normal text-gray-400">/mo</span></span>
                  </div>
                ))}
                {pkg.quotas.length === 0 && <p className="text-xs text-gray-400 col-span-3">No quotas set.</p>}
              </div>
            </div>
          ))}

          {actives.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
              <PackageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">No package yet — define this client&apos;s monthly creative quotas.</p>
              {canEdit && (
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => startEdit()}>Create package</Button>
              )}
            </div>
          ) : (
            canEdit && (
              <button onClick={() => startEdit()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-indigo-600 border border-dashed border-indigo-300 rounded-xl hover:bg-indigo-50">
                <Plus className="w-3.5 h-3.5" /> Add another package (e.g. website retainer)
              </button>
            )
          )}
        </>
      )}

      {/* Edit form */}
      {editing && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">{replaceTarget ? "Replace package" : "New package"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Social — Standard"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Active from</label>
              <input type="month" value={form.startMonth} onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Until (optional)</label>
              <input type="month" value={form.endMonth} onChange={(e) => setForm((f) => ({ ...f, endMonth: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {canSeeMoney && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Billing amount / month</label>
                  <input type="number" min="0" value={form.billingAmount}
                    onChange={(e) => setForm((f) => ({ ...f, billingAmount: e.target.value }))}
                    placeholder="e.g. 60000"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Currency</label>
                  <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Client default</option>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Quota table */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Monthly quantities <span className="text-gray-400 font-normal">(0 = not included)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm">{t.icon ?? "✨"}</span>
                  <span className="text-xs text-gray-600 flex-1 truncate">{t.name}</span>
                  <input type="number" min="0" value={form.quotas[t.id] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, quotas: { ...f.quotas, [t.id]: e.target.value } }))}
                    placeholder="0"
                    className="w-14 px-1.5 py-1 text-xs text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              ))}
            </div>
          </div>

          <textarea value={form.notes} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setEditing(false); setReplaceTarget(null); }}>Cancel</Button>
            <Button loading={saving} onClick={save}>Save package</Button>
          </div>
          {replaceTarget && (
            <p className="text-[11px] text-amber-600">Saving deactivates the package being replaced — it stays in the history below. Other active packages are untouched.</p>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Previous packages</p>
          <div className="space-y-1.5">
            {history.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 opacity-70">
                <PackageIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-700 flex-1">{p.name}</span>
                <span className="text-[11px] text-gray-400">{fmtMonth(p.startMonth)} → {fmtMonth(p.endMonth)}</span>
                {canSeeMoney && p.billingAmount != null && (
                  <span className="text-[11px] text-gray-500">{formatMoney(Number(p.billingAmount), resolveCurrency(p.currency), { precision: 0 })}/mo</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
