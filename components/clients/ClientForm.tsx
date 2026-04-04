"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2, Link2 } from "lucide-react";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Button } from "@/components/ui/Button";
import { BrandAssetsEditor } from "./BrandAssetsEditor";
import type { ClientFormData, ClientStatus, BrandColor, BrandAsset, TaxRegistration, ClientLink, ClientLinkType } from "@/types";

// ── Static data ──────────────────────────────────────────────

const INDUSTRIES = [
  "Advertising", "Architecture", "Education", "Fashion", "Finance",
  "Food & Beverage", "Healthcare", "Hospitality", "Legal", "Media",
  "NGO / Nonprofit", "Real Estate", "Retail", "Technology", "Other",
];

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Active" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "INACTIVE", label: "Inactive" },
];

const TAX_TYPES = [
  "GST", "VAT", "EIN", "ABN", "PAN", "TIN", "GSTIN",
  "CRN", "IBAN", "SWIFT", "BIC", "Other",
];

const LINK_TYPES: { value: ClientLinkType; label: string }[] = [
  { value: "logo",     label: "Logo" },
  { value: "drive",    label: "Google Drive" },
  { value: "dropbox",  label: "Dropbox" },
  { value: "figma",    label: "Figma" },
  { value: "notion",   label: "Notion" },
  { value: "github",   label: "GitHub" },
  { value: "website",  label: "Website" },
  { value: "other",    label: "Other" },
];

const EMPTY_FORM: ClientFormData = {
  name: "", companyName: "", email: "", phone: "",
  website: "", industry: "", address: "", logoUrl: "",
  links: [], brandColors: [], brandAssets: [], taxRegistrations: [],
  notes: "", status: "ACTIVE",
};

// ── Helpers ──────────────────────────────────────────────────

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}

function SelectInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ── Links Editor ─────────────────────────────────────────────

function LinksEditor({ value, onChange }: { value: ClientLink[]; onChange: (v: ClientLink[]) => void }) {
  const add = () =>
    onChange([...value, { id: uid(), label: "", url: "", type: "other" }]);
  const update = (id: string, field: keyof ClientLink, val: string) =>
    onChange(value.map((l) => l.id === id ? { ...l, [field]: val } : l));
  const remove = (id: string) => onChange(value.filter((l) => l.id !== id));

  return (
    <div className="space-y-3">
      {value.map((link) => (
        <div key={link.id} className="flex flex-col sm:grid sm:grid-cols-[140px_1fr_1fr_auto] gap-2 items-start">
          <div className="relative">
            <select
              value={link.type}
              onChange={(e) => update(link.id, "type", e.target.value)}
              className="w-full appearance-none px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {LINK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          <input
            type="text"
            value={link.label}
            onChange={(e) => update(link.id, "label", e.target.value)}
            placeholder="Label (e.g. Brand Assets)"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="url"
            value={link.url}
            onChange={(e) => update(link.id, "url", e.target.value)}
            placeholder="https://..."
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => remove(link.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {value.length === 0 && (
        <p className="text-xs text-gray-400 italic">No links added yet.</p>
      )}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Link
      </button>
    </div>
  );
}

// ── Tax Registrations ────────────────────────────────────────

function TaxRegistrationsEditor({
  value, onChange,
}: {
  value: TaxRegistration[];
  onChange: (v: TaxRegistration[]) => void;
}) {
  const add = () =>
    onChange([...value, { id: uid(), type: "GST", number: "", country: "" }]);

  const update = (id: string, field: keyof TaxRegistration, val: string) =>
    onChange(value.map((t) => (t.id === id ? { ...t, [field]: val } : t)));

  const remove = (id: string) => onChange(value.filter((t) => t.id !== id));

  return (
    <div className="space-y-3">
      {value.map((tax) => (
        <div key={tax.id} className="flex flex-col sm:grid sm:grid-cols-[120px_1fr_1fr_auto] gap-2 items-start">
          <div className="relative">
            <select
              value={tax.type}
              onChange={(e) => update(tax.id, "type", e.target.value)}
              className="w-full appearance-none px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          <input
            type="text"
            value={tax.number}
            onChange={(e) => update(tax.id, "number", e.target.value)}
            placeholder="Tax number"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={tax.country}
            onChange={(e) => update(tax.id, "country", e.target.value)}
            placeholder="Country / Region"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => remove(tax.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {value.length === 0 && (
        <p className="text-xs text-gray-400 italic">No tax registrations added.</p>
      )}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Tax Registration
      </button>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </section>
  );
}

// ── Main Form ────────────────────────────────────────────────

interface ClientFormProps {
  initialData?: Partial<ClientFormData>;
  clientId?: string;
  onSuccess?: (id: string) => void;
}

export function ClientForm({ initialData, clientId, onSuccess }: ClientFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ClientFormData>({ ...EMPTY_FORM, ...initialData });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(clientId);
  const set = <K extends keyof ClientFormData>(field: K, value: ClientFormData[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Client name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/clients/${clientId}` : "/api/clients", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess ? onSuccess(data.id) : router.push(`/clients/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Basic Info */}
      <Section title="Basic Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Contact Person Name" required>
            <TextInput value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. John Smith" />
          </FormField>
          <FormField label="Company Name">
            <TextInput value={form.companyName} onChange={(v) => set("companyName", v)} placeholder="If different from above" />
          </FormField>
          <FormField label="Email">
            <TextInput value={form.email} onChange={(v) => set("email", v)} placeholder="contact@example.com" type="email" />
          </FormField>
          <FormField label="Phone">
            <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} placeholder="Phone number" />
          </FormField>
          <FormField label="Website">
            <TextInput value={form.website} onChange={(v) => set("website", v)} placeholder="example.com or https://example.com" />
          </FormField>
          <FormField label="Industry">
            <SelectInput
              value={form.industry}
              onChange={(v) => set("industry", v)}
              options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
              placeholder="Select industry"
            />
          </FormField>
          <div className="col-span-2">
            <FormField label="Address">
              <TextInput value={form.address} onChange={(v) => set("address", v)} placeholder="123 Main St, City, Country" />
            </FormField>
          </div>
          <FormField label="Status">
            <SelectInput
              value={form.status}
              onChange={(v) => set("status", v as ClientStatus)}
              options={STATUS_OPTIONS}
            />
          </FormField>
        </div>
      </Section>

      {/* Tax & Billing */}
      <Section title="Tax & Billing">
        <p className="text-xs text-gray-500 mb-4">Add all applicable tax registrations for this client (GST, VAT, EIN, ABN, etc.)</p>
        <TaxRegistrationsEditor
          value={form.taxRegistrations}
          onChange={(v) => set("taxRegistrations", v)}
        />
      </Section>

      {/* Reference Links */}
      <Section title="Reference Links">
        <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          Add Drive folders, Figma files, Dropbox links, logos, and other client references.
          A <strong>Logo</strong> type link will be used as the client avatar throughout the app.
        </p>
        <LinksEditor
          value={form.links}
          onChange={(v) => set("links", v)}
        />
      </Section>

      {/* Brand Identity */}
      <Section title="Brand Identity">
        <BrandAssetsEditor
          colors={form.brandColors}
          assets={form.brandAssets}
          onColorsChange={(c) => set("brandColors", c)}
          onAssetsChange={(a) => set("brandAssets", a)}
          clientId={clientId}
        />
      </Section>

      {/* Notes */}
      <Section title="Internal Notes">
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          placeholder="Internal notes about this client (not visible to client)…"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={saving}>
          {isEdit ? "Save Changes" : "Create Client"}
        </Button>
      </div>
    </form>
  );
}
