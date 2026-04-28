"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ChevronDown, GripVertical, Wand2,
  DollarSign, Percent, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";
import type {
  QuotationFormData, QuotationLineItemFormData,
  PricingType, DiscountType, RateCard, ClientSummary,
} from "@/types";

// ── Constants ─────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

const PRICING_TYPE_OPTIONS: { value: PricingType; label: string; desc: string }[] = [
  { value: "FIXED",    label: "Fixed Price",  desc: "Lump-sum for the whole project" },
  { value: "RETAINER", label: "Retainer",     desc: "Monthly recurring engagement" },
  { value: "PER_ITEM", label: "Per Item",     desc: "Rate × quantity per service" },
];

const COMMON_UNITS = ["hour", "day", "week", "month", "piece", "word", "slide", "page", "revision"];

const DEFAULT_TERMS = `Payment is due within 30 days of invoice.
This quotation is valid for the period stated above.
All prices are exclusive of applicable taxes unless stated.
Work begins upon written acceptance and receipt of deposit where applicable.`;

function makeItem(): QuotationLineItemFormData {
  return {
    rateCardId: "",
    title: "",
    description: "",
    pricingType: "PER_ITEM",
    quantity: "1",
    unitPrice: "0",
    unit: "hour",
  };
}

// ── Math ──────────────────────────────────────────────────────

function computeItemSubtotal(item: QuotationLineItemFormData): number {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unitPrice) || 0;
  return qty * price;
}

function computeTotals(
  items: QuotationLineItemFormData[],
  discountType: DiscountType | "",
  discountValue: string,
  taxRate: string
) {
  const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
  const discVal = parseFloat(discountValue) || 0;
  const taxVal = parseFloat(taxRate) || 0;
  const discountAmount =
    discountType === "PERCENT" ? (subtotal * discVal) / 100
    : discountType === "AMOUNT" ? discVal
    : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (afterDiscount * taxVal) / 100;
  return {
    subtotal,
    discountAmount,
    afterDiscount,
    taxAmount,
    total: afterDiscount + taxAmount,
  };
}

const fmt = (n: number, currency: string) => formatMoney(n, currency);

// ── Sub-components ────────────────────────────────────────────

function FormField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

interface QuotationBuilderProps {
  quotationId?: string;
  initialData?: Partial<QuotationFormData>;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
}

export function QuotationBuilder({ quotationId, initialData, onSuccess, onCancel }: QuotationBuilderProps) {
  const router = useRouter();
  const isEdit = Boolean(quotationId);

  const [form, setForm] = useState<QuotationFormData>({
    clientId: "",
    title: "",
    description: "",
    pricingType: "FIXED",
    validUntil: "",
    currency: "USD",
    discountType: "",
    discountValue: "0",
    taxRate: "0",
    notes: "",
    terms: DEFAULT_TERMS,
    lineItems: [makeItem()],
    ...initialData,
  });

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Group rate cards by category for the picker
  const rateCardsByCategory = rateCards.reduce<Record<string, RateCard[]>>((acc, rc) => {
    const cat = rc.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rc);
    return acc;
  }, {});

  useEffect(() => {
    fetch("/api/clients?status=ACTIVE")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
    fetch("/api/rate-cards")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRateCards(d); })
      .catch(() => {});
  }, []);

  const set = useCallback(<K extends keyof QuotationFormData>(key: K, val: QuotationFormData[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
  }, []);

  // ── Line item helpers ─────────────────────────────────────

  const updateItem = (index: number, patch: Partial<QuotationLineItemFormData>) => {
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.map((item, i) => i === index ? { ...item, ...patch } : item),
    }));
  };

  const applyRateCard = (index: number, rcId: string) => {
    const rc = rateCards.find((r) => r.id === rcId);
    if (!rc) return;
    updateItem(index, {
      rateCardId: rcId,
      title: rc.name,
      description: rc.description || "",
      pricingType: rc.pricingType,
      unitPrice: rc.unitPrice.toString(),
      unit: rc.unit,
    });
  };

  const addItem = () => setForm((p) => ({ ...p, lineItems: [...p.lineItems, makeItem()] }));

  const removeItem = (index: number) => {
    if (form.lineItems.length === 1) return; // keep at least one
    setForm((p) => ({ ...p, lineItems: p.lineItems.filter((_, i) => i !== index) }));
  };

  // ── Validation ────────────────────────────────────────────

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.clientId) errs.clientId = "Select a client";
    if (!form.title.trim()) errs.title = "Title is required";
    if (form.lineItems.some((i) => !i.title.trim())) errs.lineItems = "All line items need a title";
    if (form.lineItems.some((i) => parseFloat(i.unitPrice) < 0)) errs.lineItems = "Prices cannot be negative";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        isEdit ? `/api/quotations/${quotationId}` : "/api/quotations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess ? onSuccess(data.id) : router.push(`/quotations/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  // ── Computed totals ───────────────────────────────────────

  const totals = computeTotals(form.lineItems, form.discountType, form.discountValue, form.taxRate);

  // ── Render ────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Section 1: Header ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Quotation Details</h2>

        {/* Pricing type selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRICING_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value} type="button"
              onClick={() => set("pricingType", opt.value)}
              className={`text-left p-3 rounded-xl border-2 transition-colors ${
                form.pricingType === opt.value
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className={`text-xs font-semibold ${form.pricingType === opt.value ? "text-indigo-700" : "text-gray-800"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Client */}
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Client" required error={fieldErrors.clientId}>
              <div className="relative">
                <select
                  value={form.clientId}
                  onChange={(e) => set("clientId", e.target.value)}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </FormField>
          </div>

          {/* Title */}
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Quotation Title" required error={fieldErrors.title}>
              <input
                type="text" value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Brand Identity Package — Acme Corp"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </FormField>
          </div>

          {/* Description */}
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Brief scope of work…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </FormField>
          </div>

          {/* Currency + Valid Until */}
          <FormField label="Currency">
            <div className="relative">
              <select
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </FormField>

          <FormField label="Valid Until">
            <input
              type="date" value={form.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </FormField>
        </div>
      </div>

      {/* ── Section 2: Line Items ─────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
          {fieldErrors.lineItems && (
            <p className="text-xs text-red-500">{fieldErrors.lineItems}</p>
          )}
        </div>

        {/* Column headers + rows - scrollable on mobile */}
        <div className="overflow-x-auto">
        <div className="min-w-[600px]">
        <div className="grid px-6 py-2 bg-gray-50 border-b border-gray-100"
          style={{ gridTemplateColumns: "1.5rem 2fr 1.5fr 0.8fr 1.2fr 0.7fr 5rem 2rem" }}>
          <div />
          <span className="text-xs font-medium text-gray-500">Item / Service</span>
          <span className="text-xs font-medium text-gray-500">Type</span>
          <span className="text-xs font-medium text-gray-500">Qty</span>
          <span className="text-xs font-medium text-gray-500">Unit Price</span>
          <span className="text-xs font-medium text-gray-500">Unit</span>
          <span className="text-xs font-medium text-gray-500 text-right">Subtotal</span>
          <div />
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {form.lineItems.map((item, idx) => (
            <div
              key={idx}
              className="grid items-start gap-2 px-6 py-3 hover:bg-gray-50/50 transition-colors"
              style={{ gridTemplateColumns: "1.5rem 2fr 1.5fr 0.8fr 1.2fr 0.7fr 5rem 2rem" }}
            >
              {/* Drag handle (visual only) */}
              <div className="pt-2.5 text-gray-300">
                <GripVertical className="w-3.5 h-3.5" />
              </div>

              {/* Title + RateCard picker + Description */}
              <div className="space-y-1">
                {/* RateCard quick-pick */}
                {rateCards.length > 0 && (
                  <div className="relative">
                    <select
                      value={item.rateCardId}
                      onChange={(e) => e.target.value ? applyRateCard(idx, e.target.value) : updateItem(idx, { rateCardId: "" })}
                      className="w-full appearance-none text-xs border border-dashed border-indigo-200 bg-indigo-50 text-indigo-700 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">+ Pick from rate card</option>
                      {Object.entries(rateCardsByCategory).map(([cat, cards]) => (
                        <optgroup key={cat} label={cat}>
                          {cards.map((rc) => (
                            <option key={rc.id} value={rc.id}>
                              {rc.name} ({rc.currency} {Number(rc.unitPrice).toFixed(2)}/{rc.unit})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <Wand2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
                  </div>
                )}
                <input
                  type="text" value={item.title} placeholder="Service or item name…"
                  onChange={(e) => updateItem(idx, { title: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text" value={item.description} placeholder="Optional description…"
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              {/* Pricing type */}
              <div className="pt-1">
                <div className="relative">
                  <select
                    value={item.pricingType}
                    onChange={(e) => updateItem(idx, { pricingType: e.target.value as PricingType })}
                    className="w-full appearance-none text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                  >
                    <option value="PER_ITEM">Per Item</option>
                    <option value="FIXED">Fixed</option>
                    <option value="RETAINER">Retainer</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Quantity */}
              <div className="pt-1">
                <input
                  type="number" min="0" step="0.5" value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                  disabled={item.pricingType === "FIXED"}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* Unit Price */}
              <div className="pt-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  {form.currency}
                </span>
                <input
                  type="number" min="0" step="0.01" value={item.unitPrice}
                  onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                  className="w-full pl-10 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Unit */}
              <div className="pt-1">
                <div className="relative">
                  <input
                    type="text" value={item.unit} list={`units-${idx}`}
                    placeholder="hour"
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    disabled={item.pricingType === "FIXED"}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <datalist id={`units-${idx}`}>
                    {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
                  </datalist>
                </div>
              </div>

              {/* Subtotal */}
              <div className="pt-2 text-right">
                <span className="text-sm font-medium text-gray-900">
                  {fmt(computeItemSubtotal(item), form.currency)}
                </span>
              </div>

              {/* Delete */}
              <div className="pt-1 flex justify-end">
                <button
                  type="button" onClick={() => removeItem(idx)}
                  disabled={form.lineItems.length === 1}
                  className="p-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        </div>{/* end min-w-[600px] */}
        </div>{/* end overflow-x-auto */}

        {/* Add item */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100">
          <button
            type="button" onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Line Item
          </button>
        </div>
      </div>

      {/* ── Section 3: Pricing Summary ────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          {/* Discount + Tax inputs */}
          <div className="space-y-4">
            {/* Discount */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Discount</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={form.discountType}
                    onChange={(e) => set("discountType", e.target.value as DiscountType | "")}
                    className="w-full appearance-none text-sm pl-3 pr-7 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">No discount</option>
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="AMOUNT">Fixed Amount</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                {form.discountType && (
                  <div className="relative w-28">
                    {form.discountType === "PERCENT"
                      ? <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      : <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    }
                    <input
                      type="number" min="0" step="0.01" value={form.discountValue}
                      onChange={(e) => set("discountValue", e.target.value)}
                      className="w-full pl-7 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Tax */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Tax Rate <span className="text-gray-400 font-normal">(GST / VAT / etc.)</span>
              </label>
              <div className="relative w-40">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                <input
                  type="number" min="0" max="100" step="0.5" value={form.taxRate}
                  onChange={(e) => set("taxRate", e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-7 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
              </div>
            </div>
          </div>

          {/* Totals summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">{fmt(totals.subtotal, form.currency)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>
                  Discount
                  {form.discountType === "PERCENT" && ` (${form.discountValue}%)`}
                </span>
                <span>− {fmt(totals.discountAmount, form.currency)}</span>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tax ({form.taxRate}%)</span>
                <span>{fmt(totals.taxAmount, form.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-indigo-700">{fmt(totals.total, form.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Notes & Terms ──────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Notes & Terms</h2>
        <FormField label="Notes to Client">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Additional notes visible on the quotation…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </FormField>
        <FormField label="Terms & Conditions">
          <textarea
            value={form.terms}
            onChange={(e) => set("terms", e.target.value)}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-xs"
          />
        </FormField>
      </div>

      {/* ── Actions ───────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button type="button" variant="secondary" onClick={onCancel ?? (() => router.back())}>Cancel</Button>
        <Button type="submit" loading={saving}>
          {isEdit ? "Save Changes" : "Create Quotation"}
        </Button>
      </div>
    </form>
  );
}
