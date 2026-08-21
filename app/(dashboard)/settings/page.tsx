"use client";

import { useState, useEffect, useCallback, useRef, Component, Fragment, type ReactNode } from "react";
import {
  Building2, Users, Shield, Palette, Save, Plus,
  Trash2, Edit2, Check, X, Upload, RefreshCw, Eye,
  EyeOff, Mail, Phone, Globe, MapPin, DollarSign,
  Clock, FileText, KeyRound, Loader2,
} from "lucide-react";
import type { CompanySettings, TeamUser, DesignationRole } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { Select } from "@/components/ui/Select";

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
type Tab = "company" | "letterhead" | "users" | "roles" | "creative-types" | "account";

// v3: job labels come from the DesignationRole table — each agency creates
// its own in the Designations section below, so there's no fixed list here.

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// v3: four permission tiers (docs/V3_CONTEXT.md §2). MEMBER is the retired
// v2 tier, kept here so any un-migrated row still renders a sensible badge.
const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  OWNER:   { label: "Owner",   color: "text-purple-400 bg-purple-400/10 border-purple-400/20", desc: "The organization owner — full access, cannot be removed" },
  ADMIN:   { label: "Admin",   color: "text-red-400 bg-red-400/10 border-red-400/20",     desc: "Full system access — manage everything including users and settings" },
  MANAGER: { label: "Manager", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", desc: "Clients, projects and money — everything except user management" },
  SMM:     { label: "SMM",     color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", desc: "Plans their own projects and reviews juniors' work — sees no money" },
  TEAM:    { label: "Team",    color: "text-sky-400 bg-sky-400/10 border-sky-400/20",     desc: "Works assigned tasks and keeps their own reminders" },
  MEMBER:  { label: "Member",  color: "text-gray-400 bg-gray-400/10 border-gray-400/20",  desc: "Retired v2 tier — migrated to Team" },
};

/** Roles that can be granted in the UI. OWNER is set at tenant creation. */
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "SMM", "TEAM"] as const;

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
        toast.success("Organization settings saved");
      } else {
        const d = await res.json();
        toast.error(d.error?.message ?? "Failed to save settings");
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
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoError("File too large. Please use an image under 1.5 MB.");
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
      <SectionCard title="Organization Identity" desc="Your agency's name and logo — shown across the platform and on every PDF (invoices, contracts)">
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
            <Field label="Organization / Agency Name">
              <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Vibrnd Creative Studio" />
            </Field>
            <Field label="Logo URL" hint="Or paste a direct URL to your logo">
              <Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Contact */}
      <SectionCard title="Contact Information" desc="Used on invoices and client-facing documents">
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
            <Select
              value={form.currency ?? "USD"}
              onChange={(v) => set("currency", v)}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Timezone">
            <Select
              value={form.timezone ?? "UTC"}
              onChange={(v) => set("timezone", v)}
              options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
            />
          </Field>
          <Field label="Date Format">
            <Select
              value={form.dateFormat ?? "MMM D, YYYY"}
              onChange={(v) => set("dateFormat", v)}
              options={DATE_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
            />
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
      <div className="flex-shrink-0 h-5 px-2 flex flex-wrap items-center justify-between gap-y-2" style={{ borderBottom: `2px solid ${accent}` }}>
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
        <div className="flex-1 px-2 flex flex-wrap items-center justify-between gap-y-2">
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
      <div className="flex-shrink-0 h-6 px-2.5 flex flex-wrap items-center justify-between gap-y-2" style={{ background: headerBg }}>
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
      <div className="flex-shrink-0 h-6 px-2.5 flex flex-wrap items-center justify-between gap-y-2" style={{ background: headerBg }}>
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
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-y-2 gap-3" style={{ background: hBg }}>
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
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-y-2 gap-3" style={{ background: hBg }}>
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
        toast.error(d.error?.message ?? "Failed to save letterhead");
      }
    } catch {
      toast.error("Failed to save letterhead");
    } finally { setSaving(false); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("Please select an image file"); return; }
    if (file.size > 1.5 * 1024 * 1024) { setLogoError("Image must be under 1.5 MB"); return; }
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
    reader.onerror = () => {
      if (uploadSeqRef.current === seq) {
        setLogoUploading(false);
        setLogoError("Could not read the image file. Please try again.");
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
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
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
  const [designations, setDesignations] = useState<DesignationRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ name: "", email: "", role: "TEAM", designationId: "" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users?includeInactive=true");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  const fetchDesignations = useCallback(async () => {
    const res = await fetch("/api/designations");
    if (res.ok) setDesignations(await res.json());
  }, []);

  useEffect(() => { fetchUsers(); fetchDesignations(); }, [fetchUsers, fetchDesignations]);

  const handleAdd = async () => {
    if (!newForm.name.trim() || !newForm.email.trim()) { setError("Name and email are required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, designationId: newForm.designationId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed"); return; }
      setUsers((p) => [...p, data]);
      setNewForm({ name: "", email: "", role: "TEAM", designationId: "" });
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

  const handleDesignationChange = async (userId: string, designationId: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designationId: designationId || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((p) => p.map((u) => u.id === userId ? updated : u));
      toast.success("Designation updated");
    } else {
      toast.error("Failed to update designation");
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
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
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
                <Select
                  value={newForm.role}
                  onChange={(v) => setNewForm((p) => ({ ...p, role: v }))}
                  options={[...ASSIGNABLE_ROLES.map((r) => ({ value: r, label: String(ROLE_LABELS[r].label) }))]}
                />
              </div>
              <div className="relative">
                <Select
                  value={newForm.designationId}
                  onChange={(v) => setNewForm((p) => ({ ...p, designationId: v }))}
                  options={[{ value: "", label: "No designation" }, ...designations.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))]}
                />
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
                designations={designations}
                onRoleChange={handleRoleChange}
                onDesignationChange={handleDesignationChange}
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
                designations={designations}
                onRoleChange={handleRoleChange}
                onDesignationChange={handleDesignationChange}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* v3: job labels the agency defines for itself */}
      <DesignationsSection
        designations={designations}
        onChanged={() => { fetchDesignations(); fetchUsers(); }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   v3: Designations — the agency's own job labels.
   A designation is a JOB, never a permission (that's Role).
   ───────────────────────────────────────────────────────────── */
function DesignationsSection({
  designations, onChanged,
}: {
  designations: DesignationRole[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [assignable, setAssignable] = useState(true);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, canBeAssignedWork: assignable }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error?.message ?? "Failed to add"); return; }
      setName(""); setAssignable(true);
      onChanged();
      toast.success(`${data.name} added`);
    } finally { setSaving(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/designations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onChanged();
    else toast.error("Failed to update designation");
  };

  const remove = async (d: DesignationRole) => {
    const holders = d._count?.users ?? 0;
    const ok = await confirm({
      title: `Remove "${d.name}"?`,
      message: holders > 0
        ? `${holders} ${holders === 1 ? "person holds" : "people hold"} this designation, so it will be deactivated rather than deleted — their job title stays intact.`
        : "Nobody holds this designation, so it will be deleted.",
      confirmLabel: holders > 0 ? "Deactivate" : "Delete",
      variant: "warning",
    });
    if (!ok) return;
    const res = await fetch(`/api/designations/${d.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { onChanged(); toast.success(data.message ?? "Designation removed"); }
    else toast.error("Failed to remove designation");
  };

  return (
    <SectionCard
      title="Designations"
      desc="The job titles your agency uses — Editor, Photographer, and so on. A designation decides who appears in assignment lists and reports; it never grants permissions. That's the Role."
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="e.g. Motion Designer"
        />
        <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap px-1">
          <input type="checkbox" checked={assignable}
            onChange={(e) => setAssignable(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          Can be assigned work
        </label>
        <button onClick={add} disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors whitespace-nowrap">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {designations.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No designations yet.</p>
      ) : (
        <div className="space-y-2">
          {designations.map((d) => (
            <div key={d.id}
              className={`flex items-center gap-3 p-3 rounded-xl border border-gray-100 transition-colors ${d.isActive ? "hover:bg-gray-50" : "bg-gray-50 opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                <p className="text-xs text-gray-400">
                  {(d._count?.users ?? 0)} {(d._count?.users ?? 0) === 1 ? "person" : "people"}
                  {!d.canBeAssignedWork && " · not assignable"}
                </p>
              </div>
              <button
                onClick={() => patch(d.id, { canBeAssignedWork: !d.canBeAssignedWork })}
                title="Toggle whether work can be assigned to this designation"
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  d.canBeAssignedWork
                    ? "text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}>
                {d.canBeAssignedWork ? "Assignable" : "Advisory"}
              </button>
              <button
                onClick={() => patch(d.id, { isActive: !d.isActive })}
                className="text-xs px-2.5 py-1 rounded-lg border text-gray-500 border-gray-200 hover:bg-gray-100 transition-colors">
                {d.isActive ? "Active" : "Inactive"}
              </button>
              <button onClick={() => remove(d)} title="Remove"
                className="text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function UserRow({
  user, designations, onRoleChange, onDesignationChange, onToggleActive,
}: {
  user: TeamUser;
  designations: DesignationRole[];
  onRoleChange: (id: string, role: string) => void;
  onDesignationChange: (id: string, designationId: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}) {
  const badge = ROLE_LABELS[user.role] ?? ROLE_LABELS.TEAM;

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

      {/* Designation select (v2 — job label, not permission) */}
      <div className="flex-shrink-0 hidden sm:block">
        <div className="relative">
          <Select
            value={user.jobTitle?.id ?? ""}
            onChange={(v) => onDesignationChange(user.id, v)}
            options={[{ value: "", label: "No designation" }, ...designations.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))]}
            size="sm"
            disabled={!user.isActive}
          />
        </div>
      </div>

      {/* Role badge / select */}
      <div className="flex-shrink-0">
        <div className="relative">
          <Select
            value={user.role}
            onChange={(v) => onRoleChange(user.id, v)}
            options={[...ASSIGNABLE_ROLES.map((r) => ({ value: r, label: String(ROLE_LABELS[r].label) }))]}
            disabled={!user.isActive}
          />
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
/* ─────────────────────────────────────────────────────────────
   Tab: Roles & Permissions

   v3: rendered from /api/permissions/matrix, which serialises the very
   table lib/permissions.ts enforces. The screen therefore cannot drift
   from the code — change a capability there and this updates itself.
   ───────────────────────────────────────────────────────────── */
interface MatrixRow {
  capability: string;
  label: string;
  group: string;
  allowed: Record<string, boolean>;
}

function RolesTab() {
  const [roles, setRoles] = useState<string[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [assignScope, setAssignScope] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/permissions/matrix")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) { setRoles(d.roles); setRows(d.rows); setAssignScope(d.assignScope); }
      })
      .finally(() => setLoading(false));
  }, []);

  const groups = rows.reduce<Record<string, MatrixRow[]>>((acc, r) => {
    (acc[r.group] = acc[r.group] ?? []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <SectionCard
        title="Role Permissions"
        desc="What each role can do. Generated from the permission layer the API enforces, so this table is always the truth rather than a description of it."
      >
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 py-2.5 pr-4">Capability</th>
                  {roles.map((role) => (
                    <th key={role} className="text-center text-xs font-semibold py-2.5 px-3">
                      <span className={`px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${ROLE_LABELS[role]?.color ?? ""}`}>
                        {ROLE_LABELS[role]?.label ?? role}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([group, groupRows]) => (
                  <Fragment key={group}>
                    <tr className="bg-gray-50/70">
                      <td colSpan={roles.length + 1}
                        className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {group}
                      </td>
                    </tr>
                    {groupRows.map((row) => (
                      <tr key={row.capability} className="border-b border-gray-100">
                        <td className="py-2.5 pr-4 text-xs text-gray-700">
                          {row.label}
                          <span className="block text-[10px] text-gray-300 font-mono">{row.capability}</span>
                        </td>
                        {roles.map((role) => (
                          <td key={role} className="text-center py-2.5 px-3">
                            {row.allowed[role]
                              ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                              : <X className="w-4 h-4 text-gray-200 mx-auto" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="bg-gray-50/70">
                  <td colSpan={roles.length + 1}
                    className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Delegation
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-xs text-gray-700">Can assign work to</td>
                  {roles.map((role) => (
                    <td key={role} className="text-center py-2.5 px-3 text-[11px] text-gray-500">
                      {assignScope[role] ?? "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-4">
          Enforced server-side in every API route. Hiding things in the interface is a second layer, never the only one.
        </p>
      </SectionCard>

      <AssignmentApprovalCard />
    </div>
  );
}

/* v3: the Head-of-Design gate. Off by default — assigning a task normally
   reaches the assignee straight away, and the Approvals queue is reserved
   for reviewing submitted work. */
function AssignmentApprovalCard() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(d ? !!d.requireAssignmentApproval : false))
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireAssignmentApproval: next }),
      });
      if (!res.ok) { toast.error("Failed to update setting"); return; }
      setEnabled(next);
      toast.success(next ? "Assignments now need approval" : "Assignments go straight to the assignee");
    } finally { setSaving(false); }
  };

  return (
    <SectionCard
      title="Assignment Approval"
      desc="Whether a Head of Design signs off on who gets a task before it reaches them."
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-800">Require Head-of-Design approval for assignments</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {enabled
              ? "On — naming an assignee sends the task to the Head of Design queue first."
              : "Off — naming an assignee hands them the task immediately. Approvals stay for reviewing submitted work."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={enabled === null || saving}
          role="switch"
          aria-checked={!!enabled}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
            enabled ? "bg-indigo-600" : "bg-gray-300"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? "translate-x-5" : ""
          }`} />
        </button>
      </div>
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Settings Page
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   Account tab — change your login password
   ───────────────────────────────────────────────────────────── */
function AccountTab() {
  const toast = useToast();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPassword(d ? !!d.hasPassword : false))
      .catch(() => setHasPassword(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (next !== confirm) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error?.message ?? "Could not update password"); return; }
      toast.success("Password updated");
      setCurrent(""); setNext(""); setConfirm(""); setHasPassword(true);
    } catch {
      toast.error("Could not update password");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="space-y-6">
      <SectionCard
        title={hasPassword === false ? "Set a Password" : "Change Password"}
        desc="Your password secures sign-in to this workspace. Minimum 8 characters."
      >
        <form onSubmit={submit} className="space-y-4 max-w-md">
          {hasPassword && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Current password</label>
              <input
                type={show ? "text" : "password"} required value={current}
                onChange={(e) => setCurrent(e.target.value)} className={inputCls}
                placeholder="Enter your current password"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">New password</label>
            <input
              type={show ? "text" : "password"} required value={next}
              onChange={(e) => setNext(e.target.value)} className={inputCls}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirm new password</label>
            <input
              type={show ? "text" : "password"} required value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className={inputCls}
              placeholder="Re-enter the new password"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500 select-none cursor-pointer">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="rounded border-gray-300" />
            Show passwords
          </label>
          <button
            type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {hasPassword === false ? "Set password" : "Update password"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Creative Types (v2 — content calendar catalog)
   ───────────────────────────────────────────────────────────── */
interface CreativeTypeRow {
  id: string; name: string; slug: string; icon: string | null;
  color: string | null; countsAsShoot: boolean; isActive: boolean;
}

function CreativeTypesTab() {
  const toast = useToast();
  const [types, setTypes] = useState<CreativeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchTypes = useCallback(async () => {
    const res = await fetch("/api/creative-types?all=1");
    if (res.ok) setTypes(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/creative-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setTypes((p) => p.map((t) => (t.id === id ? updated : t)));
    } else {
      toast.error("Update failed");
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/creative-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error?.message ?? "Failed"); return; }
      setTypes((p) => [...p, d]);
      setNewName("");
      toast.success(`"${d.name}" added`);
    } finally { setAdding(false); }
  };

  return (
    <SectionCard
      title="Creative Types"
      desc="The catalog used by every client's content calendar — rename, recolor, or add your own"
    >
      <div className="flex items-center gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a creative type (e.g. Meme)"
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={add} disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-11 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-1.5">
          {types.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 border rounded-xl ${t.isActive ? "border-gray-100" : "border-gray-100 bg-gray-50 opacity-60"}`}>
              <span className="w-6 flex justify-center"><CreativeTypeDot color={t.color} size="md" /></span>
              <input
                type="color"
                value={t.color ?? "#64748b"}
                onChange={(e) => patch(t.id, { color: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Chip color"
              />
              {editId === t.id ? (
                <input
                  autoFocus value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) { patch(t.id, { name: editName }); setEditId(null); }
                    if (e.key === "Escape") setEditId(null);
                  }}
                  onBlur={() => { if (editName.trim() && editName !== t.name) patch(t.id, { name: editName }); setEditId(null); }}
                  className="flex-1 px-2 py-1 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <button onClick={() => { setEditId(t.id); setEditName(t.name); }}
                  className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-indigo-600">
                  {t.name}
                </button>
              )}
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer" title="Counts toward the monthly shoot quota">
                <input type="checkbox" checked={t.countsAsShoot}
                  onChange={(e) => patch(t.id, { countsAsShoot: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                counts as shoot
              </label>
              <button
                onClick={() => patch(t.id, { isActive: !t.isActive })}
                className="text-xs px-2.5 py-1 rounded-lg border text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-100"
              >
                {t.isActive ? "Active" : "Inactive"}
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* v2 Phase 8: manual daily-scan trigger (admin/dev) */
function RunScanCard() {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/jobs/daily", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error?.message ?? "Scan failed"); return; }
      const s = d.summary ?? {};
      setLast(`missed tasks: ${s.deadlineMissed ?? 0} · items → MISSED: ${s.itemsMissed ?? 0} · follow-ups: ${s.followUps ?? 0} · reminders: ${s.reminders ?? 0} · digests: ${s.digests ?? 0}`);
      toast.success("Daily scan complete");
    } finally { setRunning(false); }
  };
  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-gray-800">Daily scan</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Detects missed deadlines, marks lapsed content, fires follow-ups and reminders.
          Schedule it externally by POSTing /api/jobs/daily with the x-job-secret header (e.g. a cron at 08:00 IST).
        </p>
        {last && <p className="text-[11px] text-emerald-600 mt-1">{last}</p>}
      </div>
      <button onClick={run} disabled={running}
        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
        {running ? "Scanning…" : "Run daily scan now"}
      </button>
    </div>
  );
}

/**
 * `org: true` means the tab configures the agency, not the person looking at
 * it. Those belong to admin and manager only — an SMM has no business
 * renaming the company or handing out roles. Account is everyone's: it is
 * where you change your own password, so it is never gated.
 */
const TABS: { id: Tab; label: string; icon: React.ElementType; org: boolean }[] = [
  { id: "company",        label: "Organization",   icon: Building2, org: true  },
  { id: "letterhead",     label: "Letterhead",     icon: FileText,  org: true  },
  { id: "users",          label: "Users",          icon: Users,     org: true  },
  { id: "roles",          label: "Roles",          icon: Shield,    org: true  },
  { id: "creative-types", label: "Creative Types", icon: Palette,   org: true  },
  { id: "account",        label: "Account",        icon: KeyRound,  org: false },
];

const DEFAULT_SETTINGS: CompanySettings = {
  id: "singleton", name: "My Agency", slug: null, email: null, phone: null,
  website: null, address: null, city: null, country: null, logoUrl: null,
  currency: "USD", timezone: "UTC", dateFormat: "MMM D, YYYY",
  taxRegistrations: null,
  letterheadLogoUrl: null, letterheadHeader: null, letterheadFooter: null,
  letterheadAddress: null, letterheadPhone: null, letterheadEmail: null,
  letterheadWebsite: null, letterheadColor: "#6366f1", letterheadTemplate: "CLASSIC",
  letterheadConfig: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

export default function SettingsPage() {
  const { user: me } = useCurrentUser();
  const managesOrg = can(me, "settings.manage");
  const visibleTabs = TABS.filter((t) => t.org === false || managesOrg);

  const [tab, setTab]             = useState<Tab>("company");
  const [settings, setSettings]   = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError]     = useState("");

  // Someone without org rights lands on the only tab that is theirs.
  useEffect(() => {
    if (!managesOrg && tab !== "account") setTab("account");
  }, [managesOrg, tab]);

  useEffect(() => {
    if (!managesOrg) return;
    fetch("/api/settings/company")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok && d.id) setSettings(d);
        else setSettingsError(d.error?.message ?? "Could not load settings");
      })
      .catch(() => setSettingsError("Could not reach the settings API"))
      .finally(() => setSettingsLoading(false));
  }, [managesOrg]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">{managesOrg ? "Settings" : "My Account"}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {managesOrg
            ? "Manage your agency profile, team and PDF templates"
            : "Your sign-in details. Agency settings are managed by an admin."}
        </p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-5xl">
        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
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
            {settingsError} — showing defaults. Changes will still be saved.
          </div>
        )}

        {/* Tab content */}
        {settingsLoading && (tab === "company" || tab === "letterhead") ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {tab === "company"    && (
              <>
                <CompanyTab settings={settings} onSaved={setSettings} />
                <RunScanCard />
              </>
            )}
            {tab === "letterhead" && <LetterheadTab settings={settings} onSaved={setSettings} />}
            {tab === "users"      && <UsersTab />}
            {tab === "roles"      && <RolesTab />}
            {tab === "creative-types" && <CreativeTypesTab />}
            {tab === "account"    && <AccountTab />}
          </>
        )}
      </div>
    </div>
  );
}
