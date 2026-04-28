"use client";

import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from "react";
import {
  Building2, Users, Shield, Palette, Save, Plus,
  Trash2, Edit2, Check, X, Upload, RefreshCw, Eye,
  EyeOff, Mail, Phone, Globe, MapPin, DollarSign,
  Clock, FileText, ChevronDown,
} from "lucide-react";
import type { CompanySettings, TeamUser } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
type Tab = "company" | "letterhead" | "users" | "roles";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  ADMIN:   { label: "Admin",   color: "text-red-400 bg-red-400/10 border-red-400/20",     desc: "Full system access — manage everything including users and settings" },
  MANAGER: { label: "Manager", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", desc: "Manage projects, tasks, quotations and team assignments" },
  MEMBER:  { label: "Member",  color: "text-sky-400 bg-sky-400/10 border-sky-400/20",     desc: "Work on assigned tasks and view relevant projects" },
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "JPY", "Other"];
const TIMEZONES  = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];
const DATE_FORMATS = [
  { value: "MMM D, YYYY",  label: "Jan 1, 2025" },
  { value: "DD/MM/YYYY",   label: "01/01/2025" },
  { value: "MM/DD/YYYY",   label: "01/01/2025 (US)" },
  { value: "YYYY-MM-DD",   label: "2025-01-01" },
];

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */
function SectionCard({ title, desc, children }: {
  title: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${props.className ?? ""}`}
    />
  );
}

function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white ${props.className ?? ""}`}
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white pr-8 ${props.className ?? ""}`}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Local error boundary — used to fence the live letterhead preview
   so a malformed config can't crash the entire settings page.
   ───────────────────────────────────────────────────────────── */
class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.warn("LetterheadPreview render error:", err);
  }
  componentDidUpdate(prev: { children: ReactNode }) {
    if (this.state.hasError && prev.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 disabled:opacity-60 transition-colors"
    >
      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? "Saving…" : "Save Changes"}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Company Settings
   ───────────────────────────────────────────────────────────── */
function CompanyTab({
  settings, onSaved,
}: { settings: CompanySettings; onSaved: (s: CompanySettings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<CompanySettings>>({});
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Sequence counter — latest upload always wins; older responses are discarded.
  const uploadSeqRef = useRef(0);

  useEffect(() => { setForm(settings); }, [settings]);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved(data);
        toast.success("Company settings saved");
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally { setSaving(false); }
  };

  const handleLogoUpload = (file: File) => {
    setLogoError("");
    // Validate type
    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file (PNG, JPG, SVG, WebP)");
      return;
    }
    // Warn if too large (>500KB — still works, just stores as base64)
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File too large. Please use an image under 2MB.");
      return;
    }
    const seq = ++uploadSeqRef.current;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        // Only reflect this upload if a newer one hasn't started
        if (uploadSeqRef.current === seq) set("logoUrl", dataUrl);
        // Auto-save the logo immediately — discard response if superseded
        fetch("/api/settings/company", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logoUrl: dataUrl }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (uploadSeqRef.current === seq) onSaved(data);
          })
          .catch(() => {})
          .finally(() => {
            if (uploadSeqRef.current === seq) setLogoUploading(false);
          });
      } else {
        if (uploadSeqRef.current === seq) {
          setLogoUploading(false);
          setLogoError("Failed to read file. Try again.");
        }
      }
    };
    reader.onerror = () => {
      if (uploadSeqRef.current === seq) {
        setLogoUploading(false);
        setLogoError("Failed to read file. Try again.");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Brand */}
      <SectionCard title="Brand Identity" desc="Your agency's name and logo — shown across the platform">
        <div className="flex items-start gap-6 mb-4">
          <div className="flex-shrink-0">
            <div
              className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-50 ${
                logoUploading
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-gray-300 hover:border-indigo-400"
              }`}
              onClick={() => !logoUploading && fileRef.current?.click()}
              title="Click to upload logo"
            >
              {logoUploading ? (
                <div className="text-center">
                  <RefreshCw className="w-5 h-5 text-indigo-400 mx-auto animate-spin" />
                  <p className="text-[10px] text-indigo-400 mt-1">Saving…</p>
                </div>
              ) : form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="text-center">
                  <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                  <p className="text-[10px] text-gray-400">Upload</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleLogoUpload(e.target.files[0]);
                  // Reset input so same file can be re-selected
                  e.target.value = "";
                }
              }}
            />
            {logoError ? (
              <p className="text-[10px] text-red-500 text-center mt-1 max-w-[80px]">{logoError}</p>
            ) : (
              <p className="text-[10px] text-gray-400 text-center mt-1">PNG, SVG, JPG</p>
            )}
            {form.logoUrl && !logoUploading && (
              <button
                onClick={(e) => { e.stopPropagation(); set("logoUrl", ""); }}
                className="block w-full text-[10px] text-red-400 hover:text-red-600 text-center mt-0.5 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <Field label="Agency / Company Name">
              <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Vibrnd Creative Studio" />
            </Field>
            <Field label="Logo URL" hint="Or paste a direct URL to your logo">
              <Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Contact */}
      <SectionCard title="Contact Information" desc="Used on invoices, quotations and client-facing documents">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Email">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="hello@agency.com" className="pl-8" />
            </div>
          </Field>
          <Field label="Phone">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+1 (555) 000-0000" className="pl-8" />
            </div>
          </Field>
          <Field label="Website">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://agency.com" className="pl-8" />
            </div>
          </Field>
          <Field label="City / Country">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Dubai, UAE" className="pl-8" />
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Full Address">
              <Textarea value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Street address, building, etc." rows={2} />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Regional */}
      <SectionCard title="Regional Settings" desc="Currency, timezone and date formatting used across reports">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Default Currency">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
              <Select value={form.currency ?? "USD"} onChange={(e) => set("currency", e.target.value)} className="pl-8">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </Field>
          <Field label="Timezone">
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
              <Select value={form.timezone ?? "UTC"} onChange={(e) => set("timezone", e.target.value)} className="pl-8">
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </div>
          </Field>
          <Field label="Date Format">
            <Select value={form.dateFormat ?? "MMM D, YYYY"} onChange={(e) => set("dateFormat", e.target.value)}>
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Letterhead / PDF Template
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   Letterhead template definitions
   ───────────────────────────────────────────────────────────── */
interface LetterheadConfig {
  logoPosition:    "left" | "center" | "right";
  logoSize:        "sm" | "md" | "lg";
  headerBg:        string;
  headerTextColor: "light" | "dark";
  showPhone:       boolean;
  showEmail:       boolean;
  showWebsite:     boolean;
  showAddress:     boolean;
  showAgencyName:  boolean;
  footerAlign:     "left" | "center" | "right";
  showFooterDate:  boolean;
  showFooterPageNum: boolean;
  font:            "sans" | "serif";
}

type LHTemplate = "CLASSIC" | "MODERN" | "MINIMAL" | "BOLD" | "ELEGANT" | "SPLIT" | "EXECUTIVE";

const DEFAULT_LH_CFG: LetterheadConfig = {
  logoPosition:    "left",
  logoSize:        "md",
  headerBg:        "#1e293b",
  headerTextColor: "light",
  showPhone:       true,
  showEmail:       true,
  showWebsite:     true,
  showAddress:     true,
  showAgencyName:  true,
  footerAlign:     "center",
  showFooterDate:  true,
  showFooterPageNum: true,
  font:            "sans",
};

function parseLHConfig(raw: string | null | undefined): LetterheadConfig {
  try { if (raw) return { ...DEFAULT_LH_CFG, ...JSON.parse(raw) }; } catch {}
  return { ...DEFAULT_LH_CFG };
}

interface TemplateOption {
  value: LHTemplate;
  label: string;
  desc: string;
  hasDarkHeader: boolean;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: "CLASSIC",   label: "Classic",   desc: "Clean horizontal layout with logo, name, and solid accent border",    hasDarkHeader: false },
  { value: "MODERN",    label: "Modern",    desc: "Bold vertical accent bar with contemporary typographic hierarchy",    hasDarkHeader: false },
  { value: "MINIMAL",   label: "Minimal",   desc: "Ultra-clean whitespace-driven layout with single accent underline",   hasDarkHeader: false },
  { value: "BOLD",      label: "Bold",      desc: "Full-width color band header — striking and high-impact",             hasDarkHeader: true  },
  { value: "ELEGANT",   label: "Elegant",   desc: "Centered monogram layout with fine decorative rule lines",            hasDarkHeader: false },
  { value: "SPLIT",     label: "Split",     desc: "Two-column: colored brand panel left, contact details right",        hasDarkHeader: true  },
  { value: "EXECUTIVE", label: "Executive", desc: "Dark premium header with accent-colored name — luxury positioning",  hasDarkHeader: true  },
];

/* ── Mini thumbnail for each template ── */
function TemplateThumbnail({ tpl, accent, headerBg }: { tpl: LHTemplate; accent: string; headerBg: string }) {
  if (tpl === "CLASSIC") return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-5 px-2 flex items-center justify-between" style={{ borderBottom: `2px solid ${accent}` }}>
        <div className="flex items-center gap-1"><div className="h-3 w-3 rounded" style={{ background: accent }} /><div className="h-1.5 rounded bg-gray-300 w-8" /></div>
        <div className="h-1 rounded bg-gray-200 w-8" />
      </div>
      <div className="flex-1 px-2 py-1.5 bg-gray-50 space-y-1"><div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
      <div className="flex-shrink-0 h-3 px-2 border-t border-gray-100 flex items-center justify-center"><div className="h-1 rounded bg-gray-200 w-12" /></div>
    </div>
  );
  if (tpl === "MODERN") return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-5 flex" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="w-1.5 flex-shrink-0" style={{ background: accent }} />
        <div className="flex-1 px-2 flex items-center justify-between">
          <div><div className="h-1.5 rounded bg-gray-300 w-10 mb-0.5" /><div className="h-0.5 rounded w-4" style={{ background: accent }} /></div>
          <div className="h-1 rounded bg-gray-200 w-8" />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="w-1.5 flex-shrink-0 opacity-30" style={{ background: accent }} />
        <div className="flex-1 px-2 py-1.5 bg-gray-50 space-y-1"><div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
      </div>
    </div>
  );
  if (tpl === "MINIMAL") return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-5 px-2 flex items-end justify-between pb-1" style={{ borderBottom: `1.5px solid ${accent}` }}>
        <div className="h-1.5 rounded bg-gray-600 w-12" />
        <div className="h-1 rounded bg-gray-400 w-8" />
      </div>
      <div className="flex-1 px-2 py-1.5 bg-white space-y-1"><div className="h-1 rounded bg-gray-100 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
    </div>
  );
  if (tpl === "BOLD") return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-6 px-2.5 flex items-center justify-between" style={{ background: headerBg }}>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-white/30" /><div className="h-1.5 rounded bg-white/60 w-10" /></div>
        <div className="h-1 rounded bg-white/30 w-8" />
      </div>
      <div className="flex-1 px-2 py-1.5 bg-gray-50 space-y-1"><div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
    </div>
  );
  if (tpl === "ELEGANT") return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-6 flex flex-col items-center justify-center gap-0.5 bg-white px-2 border-b" style={{ borderColor: `${accent}30` }}>
        <div className="h-1.5 rounded bg-gray-600 w-10 text-center" />
        <div className="flex items-center gap-1 mt-0.5"><div className="flex-1 h-px bg-gray-200 w-4" /><div className="w-1 h-1 rounded-full" style={{ background: accent }} /><div className="flex-1 h-px bg-gray-200 w-4" /></div>
      </div>
      <div className="flex-1 px-2 py-1.5 bg-gray-50 space-y-1"><div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
    </div>
  );
  if (tpl === "SPLIT") return (
    <div className="w-full h-16 flex rounded overflow-hidden border border-gray-200">
      <div className="w-5 flex-shrink-0 flex flex-col justify-center items-center gap-1 p-1" style={{ background: headerBg }}>
        <div className="w-2 h-2 rounded-sm bg-white/30" />
        <div className="h-0.5 rounded bg-white/40 w-3" />
      </div>
      <div className="flex-1 bg-gray-50 px-2 py-1.5 space-y-1">
        <div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" />
        <div className="h-1 rounded bg-gray-100 w-1/2" />
      </div>
    </div>
  );
  // EXECUTIVE
  return (
    <div className="w-full h-16 flex flex-col rounded overflow-hidden border border-gray-200">
      <div className="flex-shrink-0 h-6 px-2.5 flex items-center justify-between" style={{ background: headerBg }}>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-white/20" /><div className="h-2 rounded w-10" style={{ background: accent, opacity: 0.9 }} /></div>
        <div className="space-y-0.5"><div className="h-1 rounded bg-white/20 w-8" /><div className="h-1 rounded bg-white/20 w-6" /></div>
      </div>
      <div className="flex-1 px-2 py-1.5 bg-gray-50 space-y-1"><div className="h-1 rounded bg-gray-200 w-full" /><div className="h-1 rounded bg-gray-100 w-3/4" /></div>
    </div>
  );
}

/* ── Full live preview ── */
function LetterheadPreview({
  form, cfg, template,
}: {
  form: Partial<CompanySettings>;
  cfg: LetterheadConfig;
  template: LHTemplate;
}) {
  const accent  = form.letterheadColor ?? "#6366f1";
  const hBg     = cfg.headerBg ?? "#1e293b";
  const logoSrc = form.letterheadLogoUrl || form.logoUrl;
  const name    = form.letterheadHeader || form.name || "Agency Name";
  const footer  = form.letterheadFooter || "Thank you for your business.";

  const LogoEl = ({ light = false }: { light?: boolean }) => {
    const sz = cfg.logoSize === "lg" ? "h-10" : cfg.logoSize === "sm" ? "h-6" : "h-8";
    if (logoSrc) return <img src={logoSrc} alt={name} className={`${sz} object-contain`} />;
    const bg = light ? "rgba(255,255,255,0.25)" : accent;
    const wSz = cfg.logoSize === "lg" ? "w-9 h-9" : cfg.logoSize === "sm" ? "w-6 h-6" : "w-8 h-8";
    return <div className={`${wSz} rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0`} style={{ background: bg }}>{name[0]}</div>;
  };

  const ContactBlock = ({ light = false }: { light?: boolean }) => {
    const col = light ? "rgba(255,255,255,0.7)" : "#9ca3af";
    const items: string[] = [];
    if (cfg.showAddress && form.letterheadAddress) items.push(form.letterheadAddress.replace(/\n/g, " · "));
    if (cfg.showPhone   && form.letterheadPhone)   items.push(form.letterheadPhone);
    if (cfg.showEmail   && form.letterheadEmail)   items.push(form.letterheadEmail);
    if (cfg.showWebsite && form.letterheadWebsite) items.push(form.letterheadWebsite);
    if (!items.length) return null;
    return <div className="space-y-0.5">{items.map((it, i) => <p key={i} className="text-[9px] leading-relaxed" style={{ color: col }}>{it}</p>)}</div>;
  };

  const ContentSkeleton = () => (
    <div className="px-4 py-3 bg-gray-50/60 flex-1">
      <div className="space-y-1.5 mb-2">
        <div className="h-2 rounded bg-gray-200 w-1/4" />
        <div className="h-1.5 rounded bg-gray-100 w-full" />
        <div className="h-1.5 rounded bg-gray-100 w-5/6" />
      </div>
      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="h-4 px-2 flex items-center" style={{ background: accent }}><div className="h-1.5 rounded bg-white/50 w-12" /></div>
        {[1,2,3].map(i => <div key={i} className="h-5 flex items-center px-2 border-b border-gray-100 last:border-0"><div className="h-1 rounded bg-gray-200 w-full" /></div>)}
      </div>
    </div>
  );

  const agencyNameEl = cfg.showAgencyName
    ? <span className="font-bold text-[11px] leading-tight">{name}</span>
    : null;

  const logoJustify = cfg.logoPosition === "center" ? "justify-center" : cfg.logoPosition === "right" ? "justify-end" : "justify-start";

  if (template === "CLASSIC") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="px-4 py-3 flex items-start justify-between gap-3" style={{ borderBottom: `3px solid ${accent}` }}>
        <div className={`flex items-center gap-2 ${logoJustify}`}><LogoEl />{agencyNameEl && <div className="text-gray-800">{agencyNameEl}</div>}</div>
        <ContactBlock />
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-center text-[9px] text-gray-400">{footer}</div>
    </div>
  );

  if (template === "MODERN") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="flex" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="w-1.5 flex-shrink-0" style={{ background: accent }} />
        <div className="flex-1 px-3 py-3 flex items-start justify-between gap-2">
          <div className={`flex items-center gap-2 ${logoJustify}`}>
            <LogoEl />
            <div>{agencyNameEl && <div className="text-gray-900">{agencyNameEl}</div>}<div className="h-0.5 w-6 rounded mt-1" style={{ background: accent }} /></div>
          </div>
          <ContactBlock />
        </div>
      </div>
      <ContentSkeleton />
      <div className="flex">
        <div className="w-1.5 flex-shrink-0 opacity-20" style={{ background: accent }} />
        <div className="flex-1 px-3 py-1.5 text-[9px] text-gray-400">{footer}</div>
      </div>
    </div>
  );

  if (template === "MINIMAL") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="px-4 py-3">
        <div className="flex items-end justify-between gap-3 pb-2" style={{ borderBottom: `1.5px solid ${accent}` }}>
          <div className={`flex items-center gap-2 ${logoJustify}`}>
            {logoSrc && <img src={logoSrc} alt={name} className="h-6 object-contain" />}
            {agencyNameEl && <div className="text-gray-900">{agencyNameEl}</div>}
          </div>
          <div className="text-right text-[9px] text-gray-400 space-y-0.5">
            {cfg.showPhone   && form.letterheadPhone   && <p>{form.letterheadPhone}</p>}
            {cfg.showEmail   && form.letterheadEmail   && <p>{form.letterheadEmail}</p>}
            {cfg.showWebsite && form.letterheadWebsite && <p>{form.letterheadWebsite}</p>}
          </div>
        </div>
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-[9px] text-gray-400">{footer}</div>
    </div>
  );

  if (template === "BOLD") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: hBg }}>
        <div className={`flex items-center gap-2 ${logoJustify}`}><LogoEl light />{agencyNameEl && <div style={{ color: cfg.headerTextColor === "light" ? "#fff" : "#111" }} className="font-bold text-[12px]">{name}</div>}</div>
        <ContactBlock light />
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-center text-[9px] text-gray-400">{footer}</div>
    </div>
  );

  if (template === "ELEGANT") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="px-4 py-3 text-center bg-white border-b" style={{ borderColor: `${accent}30` }}>
        <div className="flex justify-center mb-1.5"><LogoEl /></div>
        {agencyNameEl && <div className="text-gray-800 text-[11px] uppercase font-semibold tracking-wide">{name}</div>}
        <div className="flex items-center gap-2 mt-1.5 justify-center">
          <div className="flex-1 h-px bg-gray-200" />
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        {(() => {
          const ps: string[] = [];
          if (cfg.showPhone   && form.letterheadPhone)   ps.push(form.letterheadPhone);
          if (cfg.showEmail   && form.letterheadEmail)   ps.push(form.letterheadEmail);
          if (cfg.showWebsite && form.letterheadWebsite) ps.push(form.letterheadWebsite);
          return ps.length ? <p className="text-[8px] text-gray-400 mt-1">{ps.join(" · ")}</p> : null;
        })()}
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-center text-[9px] text-gray-400">{footer}</div>
    </div>
  );

  if (template === "SPLIT") return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="flex border-b border-gray-200">
        <div className="w-1/3 flex-shrink-0 p-3 flex flex-col justify-center gap-1.5" style={{ background: hBg }}>
          <div className={`flex ${logoJustify}`}><LogoEl light /></div>
          {agencyNameEl && <div className="font-bold text-[10px] leading-tight" style={{ color: cfg.headerTextColor === "light" ? "#fff" : "#111" }}>{name}</div>}
          <div className="h-0.5 w-5 rounded" style={{ background: accent }} />
        </div>
        <div className="flex-1 p-3 bg-gray-50 flex flex-col justify-center space-y-0.5">
          <ContactBlock />
        </div>
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-[9px] text-gray-400">{footer}</div>
    </div>
  );

  // EXECUTIVE
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs">
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: hBg }}>
        <div className={`flex items-center gap-2.5 ${logoJustify}`}>
          <LogoEl light />
          <div>
            {agencyNameEl && <div className="font-bold text-[12px]" style={{ color: accent }}>{name}</div>}
            <div className="h-0.5 w-8 rounded mt-1 opacity-40 bg-white" />
          </div>
        </div>
        <div className="border-l border-white/10 pl-3"><ContactBlock light /></div>
      </div>
      <ContentSkeleton />
      <div className="px-4 py-2 border-t border-gray-100 text-[9px] text-gray-400">{footer}</div>
    </div>
  );
}

/* ── Toggle switch ── */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-indigo-500" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-3" : ""}`} />
      </button>
      <span className={`text-xs ${checked ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────
   LetterheadTab
   ───────────────────────────────────────────────────────────── */
function LetterheadTab({
  settings, onSaved,
}: { settings: CompanySettings; onSaved: (s: CompanySettings) => void }) {
  const toast = useToast();
  const [form, setForm]         = useState<Partial<CompanySettings>>({});
  const [cfg,  setCfg]          = useState<LetterheadConfig>({ ...DEFAULT_LH_CFG });
  const [saving, setSaving]     = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError]         = useState("");
  const [colorError, setColorError]       = useState("");
  const logoFileRef = useRef<HTMLInputElement>(null);
  // Sequence counter — latest upload wins.
  const uploadSeqRef = useRef(0);

  useEffect(() => {
    setForm(settings);
    setCfg(parseLHConfig((settings as unknown as Record<string, unknown>).letterheadConfig as string | null));
  }, [settings]);

  const HEX_RE = /^#([0-9A-Fa-f]{3}){1,2}$/;
  const setColor = (value: string) => {
    set("letterheadColor", value);
    if (!value || HEX_RE.test(value)) setColorError("");
    else setColorError("Invalid hex color (e.g. #6366f1)");
  };

  const set      = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setCfgK  = <K extends keyof LetterheadConfig>(k: K, v: LetterheadConfig[K]) => setCfg(p => ({ ...p, [k]: v }));

  const template = (form.letterheadTemplate as LHTemplate) ?? "CLASSIC";
  const accent   = form.letterheadColor ?? "#6366f1";
  const hasDarkHeader = TEMPLATE_OPTIONS.find(o => o.value === template)?.hasDarkHeader ?? false;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, letterheadConfig: JSON.stringify(cfg) };
      const res = await fetch("/api/settings/company", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved(data);
        toast.success("Letterhead settings saved");
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Failed to save letterhead");
      }
    } catch {
      toast.error("Failed to save letterhead");
    } finally { setSaving(false); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("Please select an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError("Image must be under 2 MB"); return; }
    setLogoError("");
    const seq = ++uploadSeqRef.current;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const updated = { ...form, letterheadLogoUrl: dataUrl };
      if (uploadSeqRef.current === seq) setForm(updated);
      try {
        const res = await fetch("/api/settings/company", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...updated, letterheadConfig: JSON.stringify(cfg) }),
        });
        if (res.ok && uploadSeqRef.current === seq) {
          const data = await res.json();
          onSaved(data);
        }
      } finally {
        if (uploadSeqRef.current === seq) setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">

      {/* ── Template Selector ── */}
      <SectionCard title="Template Style" desc="Choose the visual layout applied to all generated PDFs">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {TEMPLATE_OPTIONS.map(opt => {
            const isSelected = template === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => set("letterheadTemplate", opt.value)}
                className={`relative text-left p-2.5 rounded-xl border-2 transition-all ${isSelected ? "border-indigo-500 bg-indigo-50/50 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
              >
                {isSelected && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                <div className="mb-2">
                  <TemplateThumbnail tpl={opt.value} accent={accent} headerBg={cfg.headerBg} />
                </div>
                <p className={`text-xs font-semibold truncate ${isSelected ? "text-indigo-700" : "text-gray-700"}`}>{opt.label}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 leading-tight overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Editor panels ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Logo */}
          <SectionCard title="Logo" desc="Upload a letterhead logo (can be a white or dark version for colored headers)">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                {form.letterheadLogoUrl ? (
                  <img src={form.letterheadLogoUrl} alt="Letterhead logo" className="w-full h-full object-contain" />
                ) : form.logoUrl ? (
                  <img src={form.logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: accent }}>
                    {(form.name ?? "A")[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => logoFileRef.current?.click()} disabled={logoUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60">
                    {logoUploading ? <><RefreshCw className="w-3 h-3 animate-spin" /> Uploading…</> : <><Upload className="w-3 h-3" /> Upload Logo</>}
                  </button>
                  {form.letterheadLogoUrl && (
                    <button onClick={() => set("letterheadLogoUrl", "")}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                {logoError && <p className="text-[11px] text-red-500">{logoError}</p>}
                <p className="text-[11px] text-gray-400">PNG, JPG or SVG · max 2 MB</p>
              </div>
              <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>

            {/* Logo position + size */}
            <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Logo Position</p>
                <div className="flex gap-1.5">
                  {(["left","center","right"] as const).map(pos => (
                    <button key={pos} onClick={() => setCfgK("logoPosition", pos)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium capitalize transition-all ${cfg.logoPosition === pos ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Logo Size</p>
                <div className="flex gap-1.5">
                  {(["sm","md","lg"] as const).map(sz => (
                    <button key={sz} onClick={() => setCfgK("logoSize", sz)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium uppercase transition-all ${cfg.logoSize === sz ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Header Content */}
          <SectionCard title="Header Content" desc="Control what information appears in the letterhead header">
            <div className="space-y-4">
              <Field label="Agency Name / Header Line">
                <div className="flex items-center gap-3">
                  <Input value={form.letterheadHeader ?? ""} onChange={e => set("letterheadHeader", e.target.value)} placeholder={form.name ?? "Vibrnd Creative Studio"} />
                  <Toggle checked={cfg.showAgencyName} onChange={v => setCfgK("showAgencyName", v)} label="Show" />
                </div>
              </Field>
              <Field label="Address Block">
                <div className="flex items-start gap-3">
                  <Textarea value={form.letterheadAddress ?? ""} onChange={e => set("letterheadAddress", e.target.value)} placeholder={"123 Creative Lane\nDubai, UAE"} rows={2} />
                  <div className="mt-1 flex-shrink-0"><Toggle checked={cfg.showAddress} onChange={v => setCfgK("showAddress", v)} label="Show" /></div>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input value={form.letterheadPhone ?? ""} onChange={e => set("letterheadPhone", e.target.value)} placeholder="+971 50 000 0000" />
                  <div className="mt-1.5"><Toggle checked={cfg.showPhone} onChange={v => setCfgK("showPhone", v)} label="Show phone" /></div>
                </Field>
                <Field label="Email">
                  <Input value={form.letterheadEmail ?? ""} onChange={e => set("letterheadEmail", e.target.value)} placeholder="hello@agency.com" />
                  <div className="mt-1.5"><Toggle checked={cfg.showEmail} onChange={v => setCfgK("showEmail", v)} label="Show email" /></div>
                </Field>
              </div>
              <Field label="Website">
                <div className="flex items-center gap-3">
                  <Input value={form.letterheadWebsite ?? ""} onChange={e => set("letterheadWebsite", e.target.value)} placeholder="www.agency.com" />
                  <Toggle checked={cfg.showWebsite} onChange={v => setCfgK("showWebsite", v)} label="Show" />
                </div>
              </Field>
            </div>
          </SectionCard>

          {/* Styling */}
          <SectionCard title="Styling" desc="Colors, fonts, and visual treatment for your letterhead">
            <div className="space-y-5">
              <Field label="Accent Color" hint="Used for borders, table headers, and highlights">
                <div className="flex items-center gap-3">
                  <input type="color" value={form.letterheadColor ?? "#6366f1"} onChange={e => setColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 bg-white" />
                  <Input value={form.letterheadColor ?? "#6366f1"} onChange={e => setColor(e.target.value)} placeholder="#6366f1" className="flex-1 font-mono" />
                </div>
                {colorError && <p className="text-[11px] text-red-500 mt-1">{colorError}</p>}
                <div className="mt-3 flex gap-2 flex-wrap">
                  {["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#0f172a","#f97316","#14b8a6"].map(c => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${(form.letterheadColor ?? "#6366f1") === c ? "border-gray-700 scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ background: c }} title={c} />
                  ))}
                </div>
              </Field>

              {hasDarkHeader && (
                <Field label="Header Background" hint={`Background color for the ${template.toLowerCase()} header`}>
                  <div className="flex items-center gap-3">
                    <input type="color" value={cfg.headerBg} onChange={e => setCfgK("headerBg", e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 bg-white" />
                    <Input value={cfg.headerBg} onChange={e => setCfgK("headerBg", e.target.value)} placeholder="#1e293b" className="flex-1 font-mono" />
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {["#1e293b","#111827","#1a1a2e","#0f172a","#1e3a5f","#2d1b69","#1a3a2a","#3d0000","#1c1917","#292524"].map(c => (
                      <button key={c} onClick={() => setCfgK("headerBg", c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${cfg.headerBg === c ? "border-gray-400 scale-110" : "border-transparent hover:scale-105"}`}
                        style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <p className="text-xs text-gray-500 mr-2 self-center">Text on header:</p>
                    {(["light","dark"] as const).map(tc => (
                      <button key={tc} onClick={() => setCfgK("headerTextColor", tc)}
                        className={`px-3 py-1 text-xs rounded-lg border font-medium capitalize transition-all ${cfg.headerTextColor === tc ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {tc}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Font Style" hint="Typography used throughout the PDF">
                <div className="flex gap-2">
                  {([
                    { value: "sans" as const, label: "Sans-serif", sub: "Helvetica / Arial" },
                    { value: "serif" as const, label: "Serif", sub: "Georgia / Times" },
                  ]).map(f => (
                    <button key={f.value} onClick={() => setCfgK("font", f.value)}
                      className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${cfg.font === f.value ? "border-indigo-500 bg-indigo-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                      <p className={`text-xs font-semibold ${cfg.font === f.value ? "text-indigo-700" : "text-gray-700"}`} style={{ fontFamily: f.value === "serif" ? "Georgia, serif" : undefined }}>{f.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{f.sub}</p>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </SectionCard>

          {/* Footer */}
          <SectionCard title="Footer" desc="Footer text and layout options shown at the bottom of every PDF page">
            <div className="space-y-4">
              <Field label="Footer Text">
                <Input value={form.letterheadFooter ?? ""} onChange={e => set("letterheadFooter", e.target.value)} placeholder="Thank you for your business." />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">Text Alignment</p>
                  <div className="flex gap-1.5">
                    {(["left","center","right"] as const).map(a => (
                      <button key={a} onClick={() => setCfgK("footerAlign", a)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-medium capitalize transition-all ${cfg.footerAlign === a ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Show in Footer</p>
                  <Toggle checked={cfg.showFooterDate} onChange={v => setCfgK("showFooterDate", v)} label="Generated date" />
                  <Toggle checked={cfg.showFooterPageNum} onChange={v => setCfgK("showFooterPageNum", v)} label="Page number" />
                </div>
              </div>
            </div>
          </SectionCard>

        </div>

        {/* ── Live Preview ── */}
        <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-700">Live Preview</p>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
                {template.charAt(0) + template.slice(1).toLowerCase()} layout
              </span>
            </div>
            <PreviewBoundary
              fallback={
                <div className="p-6 text-center bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-medium text-red-600">Invalid letterhead config</p>
                  <p className="text-[11px] text-red-400 mt-1">Reset or adjust settings to restore the preview.</p>
                </div>
              }
            >
              <LetterheadPreview form={form} cfg={cfg} template={template} />
            </PreviewBoundary>
            <p className="text-[10px] text-gray-400 mt-3 text-center leading-relaxed">
              Updates in real-time · Applied to all exported PDFs
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: User Management
   ───────────────────────────────────────────────────────────── */
function UsersTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers]     = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ name: "", email: "", role: "MEMBER" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users?includeInactive=true");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!newForm.name.trim() || !newForm.email.trim()) { setError("Name and email are required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setUsers((p) => [...p, data]);
      setNewForm({ name: "", email: "", role: "MEMBER" });
      setShowAdd(false);
      toast.success(`${data.name} added to team`);
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((p) => p.map((u) => u.id === userId ? updated : u));
      toast.success("Role updated");
    } else {
      toast.error("Failed to update role");
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const ok = await confirm({
      title: isActive ? "Deactivate member?" : "Reactivate member?",
      message: isActive
        ? "This member will lose access to the platform."
        : "This member will regain access to the platform.",
      confirmLabel: isActive ? "Deactivate" : "Reactivate",
      variant: isActive ? "warning" : "info",
    });
    if (!ok) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((p) => p.map((u) => u.id === userId ? updated : u));
      toast.success(isActive ? "Member deactivated" : "Member reactivated");
    } else {
      toast.error("Failed to update member");
    }
  };

  const activeUsers   = users.filter((u) => u.isActive);
  const inactiveUsers = users.filter((u) => !u.isActive);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Team Members"
        desc="Manage who has access to the platform and their permission level"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-500">{activeUsers.length} active member{activeUsers.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Member
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-indigo-800">Add New Team Member</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                value={newForm.name}
                onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
              />
              <Input
                value={newForm.email}
                onChange={(e) => setNewForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@agency.com"
                type="email"
              />
              <div className="relative">
                <select
                  value={newForm.role}
                  onChange={(e) => setNewForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="MEMBER">Member</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-60 transition-colors"
              >
                {saving ? "Adding…" : "Add Member"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(""); }}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {activeUsers.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onRoleChange={handleRoleChange}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {inactiveUsers.length > 0 && (
        <SectionCard title="Deactivated Members" desc="These users can no longer log in but their data is preserved">
          <div className="space-y-2">
            {inactiveUsers.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onRoleChange={handleRoleChange}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function UserRow({
  user, onRoleChange, onToggleActive,
}: {
  user: TeamUser;
  onRoleChange: (id: string, role: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}) {
  const badge = ROLE_LABELS[user.role] ?? ROLE_LABELS.MEMBER;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors group ${
      user.isActive ? "border-gray-100 hover:bg-gray-50" : "border-gray-100 bg-gray-50 opacity-60"
    }`}>
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {initials(user.name)}
      </div>

      {/* Name + email */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
        <p className="text-xs text-gray-400 truncate">{user.email}</p>
      </div>

      {/* Role badge / select */}
      <div className="flex-shrink-0">
        <div className="relative">
          <select
            value={user.role}
            onChange={(e) => onRoleChange(user.id, e.target.value)}
            disabled={!user.isActive}
            className={`appearance-none text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-6 ${badge.color}`}
          >
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="MEMBER">Member</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
        </div>
      </div>

      {/* Active toggle */}
      <button
        onClick={() => onToggleActive(user.id, user.isActive)}
        className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border transition-colors text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-100"
        title={user.isActive ? "Deactivate user" : "Reactivate user"}
      >
        {user.isActive ? "Active" : "Inactive"}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Roles & Permissions
   ───────────────────────────────────────────────────────────── */
const PERMISSIONS: { area: string; admin: boolean; manager: boolean; member: boolean }[] = [
  { area: "View Dashboard",             admin: true,  manager: true,  member: true  },
  { area: "View Clients",               admin: true,  manager: true,  member: true  },
  { area: "Create / Edit Clients",      admin: true,  manager: true,  member: false },
  { area: "Delete Clients",             admin: true,  manager: false, member: false },
  { area: "View Projects",              admin: true,  manager: true,  member: true  },
  { area: "Create / Edit Projects",     admin: true,  manager: true,  member: false },
  { area: "Delete Projects",            admin: true,  manager: false, member: false },
  { area: "View & Manage Tasks",        admin: true,  manager: true,  member: true  },
  { area: "Create / Assign Tasks",      admin: true,  manager: true,  member: false },
  { area: "Create Quotations",          admin: true,  manager: true,  member: false },
  { area: "Approve Quotations",         admin: true,  manager: false, member: false },
  { area: "View Invoices",              admin: true,  manager: true,  member: false },
  { area: "Manage Expenses",            admin: true,  manager: true,  member: false },
  { area: "Manage Contracts",           admin: true,  manager: true,  member: false },
  { area: "Manage Vendors",             admin: true,  manager: true,  member: false },
  { area: "View Files",                 admin: true,  manager: true,  member: true  },
  { area: "Upload / Delete Files",      admin: true,  manager: true,  member: true  },
  { area: "Manage Users",               admin: true,  manager: false, member: false },
  { area: "Change Company Settings",    admin: true,  manager: false, member: false },
  { area: "View Messages / Channels",   admin: true,  manager: true,  member: true  },
  { area: "Create Channels",            admin: true,  manager: true,  member: false },
];

function RolesTab() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Role Permissions"
        desc="Reference guide for what each role can do across the platform. Roles are assigned per user in the Users tab."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 py-2.5 pr-4 w-1/2">Permission Area</th>
                {(["Admin", "Manager", "Member"] as const).map((role) => (
                  <th key={role} className="text-center text-xs font-semibold py-2.5 px-4 w-1/6">
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${ROLE_LABELS[role.toUpperCase()].color}`}>
                      {role}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                  <td className="py-2.5 pr-4 text-xs text-gray-700">{row.area}</td>
                  {([row.admin, row.manager, row.member] as boolean[]).map((allowed, j) => (
                    <td key={j} className="text-center py-2.5 px-4">
                      {allowed
                        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <X className="w-4 h-4 text-gray-300 mx-auto" />
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-4">
          * Role enforcement is implemented at the API level. Custom role editing coming in a future update.
        </p>
      </SectionCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Settings Page
   ───────────────────────────────────────────────────────────── */
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "company",     label: "Company",    icon: Building2 },
  { id: "letterhead",  label: "Letterhead", icon: FileText  },
  { id: "users",       label: "Users",      icon: Users     },
  { id: "roles",       label: "Roles",      icon: Shield    },
];

const DEFAULT_SETTINGS: CompanySettings = {
  id: "singleton", name: "My Agency", email: null, phone: null,
  website: null, address: null, city: null, country: null, logoUrl: null,
  currency: "USD", timezone: "UTC", dateFormat: "MMM D, YYYY",
  letterheadLogoUrl: null, letterheadHeader: null, letterheadFooter: null,
  letterheadAddress: null, letterheadPhone: null, letterheadEmail: null,
  letterheadWebsite: null, letterheadColor: "#6366f1", letterheadTemplate: "CLASSIC",
  letterheadConfig: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

export default function SettingsPage() {
  const [tab, setTab]             = useState<Tab>("company");
  const [settings, setSettings]   = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError]     = useState("");

  useEffect(() => {
    fetch("/api/settings/company")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok && d.id) setSettings(d);
        else setSettingsError(d.error ?? "Could not load settings");
      })
      .catch(() => setSettingsError("Could not reach the settings API"))
      .finally(() => setSettingsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your agency profile, team and PDF templates</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-5xl">
        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Settings load error banner — only shown after load completes with an error */}
        {!settingsLoading && settingsError && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            ⚠️ {settingsError} — showing defaults. Changes will still be saved.
          </div>
        )}

        {/* Tab content */}
        {settingsLoading && (tab === "company" || tab === "letterhead") ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {tab === "company"    && <CompanyTab    settings={settings} onSaved={setSettings} />}
            {tab === "letterhead" && <LetterheadTab settings={settings} onSaved={setSettings} />}
            {tab === "users"      && <UsersTab />}
            {tab === "roles"      && <RolesTab />}
          </>
        )}
      </div>
    </div>
  );
}
