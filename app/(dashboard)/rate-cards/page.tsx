"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Tag, Edit3, Trash2, Check, X, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@/lib/format";
import type { RateCard, RateCardFormData, PricingType } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];
const COMMON_UNITS = ["hour", "day", "week", "month", "piece", "word", "slide", "page", "revision", "project"];
const CATEGORIES = ["Design", "Development", "Strategy", "Content", "Video", "Photography", "Marketing", "Consulting", "Other"];

const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  PER_ITEM: "Per Item",
  FIXED: "Fixed",
  RETAINER: "Retainer",
};

const EMPTY_FORM: RateCardFormData = {
  name: "", description: "", category: "", pricingType: "PER_ITEM",
  unit: "hour", unitPrice: "", currency: "USD",
};

interface RateCardRowProps {
  rc: RateCard;
  onUpdate: (id: string, data: Partial<RateCardFormData>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function RateCardRow({ rc, onUpdate, onDelete }: RateCardRowProps) {
  const initialForm = (): RateCardFormData => ({
    name: rc.name, description: rc.description ?? "", category: rc.category ?? "",
    pricingType: rc.pricingType, unit: rc.unit, unitPrice: String(rc.unitPrice), currency: rc.currency,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RateCardFormData>(initialForm);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(rc.id, form);
    setSaving(false);
    setEditing(false);
  };

  // Restore the original values (including category) when the user cancels.
  const handleCancel = () => {
    setForm(initialForm());
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="bg-indigo-50/50">
        <td className="px-4 py-3">
          <input
            type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text" value={form.description} placeholder="Description…"
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </td>
        <td className="px-3 py-3">
          <div className="relative">
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full appearance-none text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none bg-white"
            >
              <option value="">General</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="relative">
            <select
              value={form.pricingType}
              onChange={(e) => setForm((p) => ({ ...p, pricingType: e.target.value as PricingType }))}
              className="w-full appearance-none text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none bg-white"
            >
              {(["PER_ITEM", "FIXED", "RETAINER"] as PricingType[]).map((t) => (
                <option key={t} value={t}>{PRICING_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex gap-1.5">
            <input
              type="number" min="0" step="0.01" value={form.unitPrice}
              onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))}
              className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <div className="relative">
              <select
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                className="appearance-none text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none bg-white pr-6"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          <input
            type="text" value={form.unit} list="unit-list"
            onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
            className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <datalist id="unit-list">
            {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
          </datalist>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave} disabled={saving}
              className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 group">
      <td className="px-4 py-3.5">
        <p className="text-sm font-medium text-gray-900">{rc.name}</p>
        {rc.description && <p className="text-xs text-gray-500 mt-0.5">{rc.description}</p>}
      </td>
      <td className="px-3 py-3.5">
        {rc.category && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
            <Tag className="w-3 h-3" /> {rc.category}
          </span>
        )}
      </td>
      <td className="px-3 py-3.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          rc.pricingType === "RETAINER" ? "bg-purple-50 text-purple-700" :
          rc.pricingType === "FIXED" ? "bg-gray-100 text-gray-600" :
          "bg-sky-50 text-sky-700"
        }`}>
          {PRICING_TYPE_LABELS[rc.pricingType]}
        </span>
      </td>
      <td className="px-3 py-3.5 text-sm font-semibold text-gray-900">
        {formatMoney(Number(rc.unitPrice), rc.currency)}
      </td>
      <td className="px-3 py-3.5 text-sm text-gray-500">per {rc.unit}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(rc.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function RateCardsPage() {
  const toast   = useToast();
  const confirm = useConfirm();
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RateCardFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchRateCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rate-cards");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRateCards(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRateCards(); }, [fetchRateCards]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.unitPrice || isNaN(parseFloat(form.unitPrice))) { setFormError("Valid price is required"); return; }
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch("/api/rate-cards", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRateCards((p) => [data, ...p]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast.success("Rate card created");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string, data: Partial<RateCardFormData>) => {
    const res = await fetch(`/api/rate-cards/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setRateCards((p) => p.map((rc) => rc.id === id ? updated : rc));
      toast.success("Rate card updated");
    } else {
      toast.error("Failed to update rate card");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Archive rate card?",
      message: "This rate card will be archived and hidden from quotation dropdowns.",
      confirmLabel: "Archive",
      variant: "warning",
    });
    if (!ok) return;
    await fetch(`/api/rate-cards/${id}`, { method: "DELETE" });
    setRateCards((p) => p.filter((rc) => rc.id !== id));
    toast.success("Rate card archived");
  };

  // Group by category for display
  const categories = [...new Set(rateCards.map((rc) => rc.category || "General"))];

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Rate Cards</h1>
            <p className="text-sm text-gray-500 mt-0.5">Standard pricing catalog for services</p>
          </div>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowForm((v) => !v)}>
            Add Rate
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto space-y-6">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white border border-indigo-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">New Rate Card</h2>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Service Name *</label>
                <input
                  type="text" value={form.name} placeholder="e.g. Logo Design"
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                <input
                  type="text" value={form.description} placeholder="Brief description…"
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                <div className="relative">
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">General</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Pricing Type</label>
                <div className="relative">
                  <select
                    value={form.pricingType}
                    onChange={(e) => setForm((p) => ({ ...p, pricingType: e.target.value as PricingType }))}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="PER_ITEM">Per Item (qty × rate)</option>
                    <option value="FIXED">Fixed (lump sum)</option>
                    <option value="RETAINER">Retainer (monthly)</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Unit Price *</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0" step="0.01" value={form.unitPrice} placeholder="0.00"
                    onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="relative">
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                      className="appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white pr-8"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Unit</label>
                <input
                  type="text" value={form.unit} list="create-unit-list" placeholder="hour"
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="create-unit-list">
                  {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={creating}>Add Rate Card</Button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-amber-800">Database not connected</p>
            <p className="text-xs text-amber-600 mt-1">{error}</p>
          </div>
        ) : rateCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Tag className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No rate cards yet</p>
            <p className="text-xs text-gray-400 mt-1">Add standard rates to quickly fill quotation line items</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const cards = rateCards.filter((rc) => (rc.category || "General") === cat);
              return (
                <div key={cat} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{cat}</span>
                    <span className="text-xs text-gray-400 ml-auto">{cards.length} rate{cards.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Service</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5 w-28">Category</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5 w-24">Type</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5 w-28">Price</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5 w-20">Unit</th>
                        <th className="w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cards.map((rc) => (
                        <RateCardRow key={rc.id} rc={rc} onUpdate={handleUpdate} onDelete={handleDelete} />
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
