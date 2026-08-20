"use client";

import { useState, useRef } from "react";
import {
  Plus, Trash2, Pencil, X, Check,
  ImageIcon, Type, BookOpen, Sparkles, Camera,
  Grid2X2, Share2, FileText, Package, Palette, ALargeSmall,
  ExternalLink, Link2, Upload, Loader2,
} from "lucide-react";
import type { BrandColor, BrandAsset, ColorTag, AssetType } from "@/types";
import { Select } from "@/components/ui/Select";

// ── Constants ────────────────────────────────────────────────

export const COLOR_TAGS: { value: ColorTag; label: string; style: string }[] = [
  { value: "primary",    label: "Primary",     style: "bg-indigo-100 text-indigo-700" },
  { value: "secondary",  label: "Secondary",   style: "bg-purple-100 text-purple-700" },
  { value: "tertiary",   label: "Tertiary",    style: "bg-pink-100 text-pink-700" },
  { value: "accent",     label: "Accent",      style: "bg-orange-100 text-orange-700" },
  { value: "background", label: "Background",  style: "bg-stone-100 text-stone-600" },
  { value: "surface",    label: "Surface",     style: "bg-slate-100 text-slate-600" },
  { value: "text",       label: "Text / Dark", style: "bg-zinc-100 text-zinc-700" },
  { value: "link",       label: "Link",        style: "bg-blue-100 text-blue-700" },
  { value: "success",    label: "Success",     style: "bg-green-100 text-green-700" },
  { value: "warning",    label: "Warning",     style: "bg-yellow-100 text-yellow-700" },
  { value: "error",      label: "Error",       style: "bg-red-100 text-red-600" },
  { value: "other",      label: "Other",       style: "bg-gray-100 text-gray-500" },
];

export const ASSET_TYPES: { value: AssetType; label: string; icon: React.ElementType }[] = [
  { value: "logo",       label: "Logo",               icon: ImageIcon },
  { value: "icon",       label: "Icon / Logomark",    icon: Sparkles },
  { value: "wordmark",   label: "Wordmark",           icon: Type },
  { value: "guidelines", label: "Brand Guidelines",   icon: BookOpen },
  { value: "typography", label: "Typography",         icon: ALargeSmall },
  { value: "illustration", label: "Illustration",     icon: Palette },
  { value: "photography", label: "Photography",       icon: Camera },
  { value: "pattern",    label: "Pattern / Texture",  icon: Grid2X2 },
  { value: "social_kit", label: "Social Media Kit",   icon: Share2 },
  { value: "stationery", label: "Stationery",         icon: FileText },
  { value: "other",      label: "Other",              icon: Package },
];

export const ASSET_GROUPS: { label: string; types: AssetType[] }[] = [
  { label: "Logos & Marks",      types: ["logo", "icon", "wordmark"] },
  { label: "Guidelines & Docs",  types: ["guidelines"] },
  { label: "Typography",         types: ["typography"] },
  { label: "Visuals",            types: ["illustration", "photography", "pattern"] },
  { label: "Kits & Stationery",  types: ["social_kit", "stationery"] },
  { label: "Other",              types: ["other"] },
];

export const VARIANTS_BY_TYPE: Record<AssetType, string[]> = {
  logo:         ["Primary", "Secondary", "Horizontal", "Stacked / Portrait", "Logomark", "Favicon", "Dark Version", "Light / Reversed", "Monochrome", "Other"],
  icon:         ["Full Color", "Dark", "Light", "Monochrome", "Outline", "Other"],
  wordmark:     ["Primary", "Dark", "Light", "Monochrome", "Other"],
  guidelines:   ["Brand Guidelines", "Style Guide", "Usage Rules", "Tone of Voice", "Messaging Guide", "Other"],
  typography:   ["Primary Font", "Secondary Font", "Display Font", "Body Font", "Mono Font", "Other"],
  illustration: ["Hero Illustration", "Icon Set", "Pattern Set", "Character", "Spot Illustration", "Other"],
  photography:  ["Product", "Lifestyle", "Team / People", "Location", "Abstract", "Other"],
  pattern:      ["Primary Pattern", "Secondary Pattern", "Texture", "Background", "Other"],
  social_kit:   ["Instagram", "LinkedIn", "Twitter/X", "Facebook", "YouTube", "General", "Other"],
  stationery:   ["Business Card", "Letterhead", "Email Signature", "Envelope", "Other"],
  other:        ["Primary", "Secondary", "Other"],
};

const FILE_FORMATS = ["SVG", "PNG", "JPG / JPEG", "PDF", "AI", "EPS", "Figma", "Sketch", "WebP", "MP4", "MP3", "GIF", "URL / Link", "Other"];

// ── Utilities ────────────────────────────────────────────────

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Auto-generate a human-readable color name from hex using HSL */
function hexToColorName(hex: string): string {
  if (!hex || hex.length < 7) return "";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const hDeg = Math.round(h * 360);
  const sP   = Math.round(s * 100);
  const lP   = Math.round(l * 100);

  if (lP <= 5)  return "Black";
  if (lP >= 95) return "White";
  if (sP < 8) {
    if (lP < 30) return "Charcoal";
    if (lP < 55) return "Gray";
    return "Silver";
  }

  let hue = "";
  if (hDeg < 15 || hDeg >= 345) hue = "Red";
  else if (hDeg < 40)  hue = "Orange";
  else if (hDeg < 65)  hue = "Yellow";
  else if (hDeg < 150) hue = "Green";
  else if (hDeg < 195) hue = "Cyan";
  else if (hDeg < 255) hue = "Blue";
  else if (hDeg < 290) hue = "Purple";
  else                 hue = "Pink";

  let mod = "";
  if (lP < 28)             mod = "Deep ";
  else if (lP < 42)        mod = "Dark ";
  else if (lP > 72)        mod = "Light ";
  else if (sP > 85 && lP > 45 && lP < 65) mod = "Vivid ";

  return `${mod}${hue}`;
}

/** Derive format string from file extension */
function formatFromFile(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    svg: "SVG", png: "PNG", jpg: "JPG / JPEG", jpeg: "JPG / JPEG",
    pdf: "PDF", ai: "AI", eps: "EPS", fig: "Figma", sketch: "Sketch",
    webp: "WebP", mp4: "MP4", mp3: "MP3", gif: "GIF",
  };
  return map[ext] ?? "Other";
}

// ── Sub-components ───────────────────────────────────────────

function ColorTagBadge({ tag }: { tag: ColorTag }) {
  const t = COLOR_TAGS.find((c) => c.value === tag);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${t?.style ?? "bg-gray-100 text-gray-500"}`}>
      {t?.label ?? tag}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", className = "" }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    />
  );
}

// ── Color picker (shared between Add and Edit forms) ─────────

function ColorPickerFields({
  hex, name, tag,
  onHex, onName, onTag,
}: {
  hex: string; name: string; tag: ColorTag;
  onHex: (v: string) => void; onName: (v: string) => void; onTag: (v: ColorTag) => void;
}) {
  const handleHexChange = (v: string) => {
    onHex(v);
    // Auto-fill name if it's currently empty or matches a previously auto-generated name
    const autoName = hexToColorName(v.length === 7 ? v : "#6366F1");
    if (autoName) onName(autoName);
  };

  const handlePickerChange = (v: string) => {
    onHex(v);
    const autoName = hexToColorName(v);
    if (autoName) onName(autoName);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={hex.length === 7 ? hex : "#6366F1"}
              onChange={(e) => handlePickerChange(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border border-gray-300 p-0.5 bg-white flex-shrink-0"
              style={{ appearance: "none", padding: "2px" }}
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
                  handleHexChange(v.startsWith("#") ? v : `#${v}`);
                }
              }}
              placeholder="#6366F1"
              className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </Field>
        <Field label="Tag / Role">
          <Select
            value={tag}
            onChange={(v) => onTag(v as ColorTag)}
            options={COLOR_TAGS.map((t) => ({ value: t.value, label: t.label }))}
          />
        </Field>
      </div>
      <Field label="Color Name">
        <Input
          value={name}
          onChange={onName}
          placeholder="Auto-filled from color — or type your own"
        />
      </Field>
    </>
  );
}

// ── Color Item ───────────────────────────────────────────────

const EMPTY_COLOR = (): BrandColor => ({ id: uid(), hex: "#6366F1", name: hexToColorName("#6366F1"), tag: "primary" });

function ColorItem({ color, isEditing, onEdit, onCancel, onSave, onDelete }: {
  color: BrandColor; isEditing: boolean;
  onEdit: () => void; onCancel: () => void;
  onSave: (updated: BrandColor) => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState<BrandColor>(color);

  const handleEditClick = () => { setDraft({ ...color }); onEdit(); };

  if (!isEditing) {
    return (
      <div className="group flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm transition-all">
        <div className="w-10 h-10 rounded-lg flex-shrink-0 border border-black/10 shadow-sm" style={{ backgroundColor: color.hex }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 truncate">
              {color.name || <span className="text-gray-400 italic">Unnamed</span>}
            </span>
            <ColorTagBadge tag={color.tag} />
          </div>
          <span className="text-xs font-mono text-gray-500">{color.hex.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleEditClick} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-indigo-300 rounded-xl bg-indigo-50/30 p-4 space-y-3">
      <ColorPickerFields
        hex={draft.hex} name={draft.name} tag={draft.tag}
        onHex={(v) => setDraft((p) => ({ ...p, hex: v }))}
        onName={(v) => setDraft((p) => ({ ...p, name: v }))}
        onTag={(v) => setDraft((p) => ({ ...p, tag: v }))}
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.hex || draft.hex.length < 4}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

function AddColorForm({ onAdd, onCancel }: { onAdd: (c: BrandColor) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<BrandColor>(EMPTY_COLOR());

  return (
    <div className="border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700">New Color</p>
      <ColorPickerFields
        hex={draft.hex} name={draft.name} tag={draft.tag}
        onHex={(v) => setDraft((p) => ({ ...p, hex: v }))}
        onName={(v) => setDraft((p) => ({ ...p, name: v }))}
        onTag={(v) => setDraft((p) => ({ ...p, tag: v }))}
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={() => onAdd({ ...draft, id: uid() })}
          disabled={!draft.hex || draft.hex.length < 4}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Color
        </button>
      </div>
    </div>
  );
}

// ── Asset file upload helper ──────────────────────────────────

function AssetUrlField({
  url, format, name,
  onUrl, onFormat, onName,
  clientId,
}: {
  url: string; format: string; name: string;
  onUrl: (v: string) => void; onFormat: (v: string) => void; onName: (v: string) => void;
  clientId?: string;
}) {
  const [mode, setMode] = useState<"url" | "upload">(url && !url.startsWith("/uploads") ? "url" : url ? "upload" : "url");
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState(url ? url.split("/").pop() ?? "" : "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mimeCategory", file.type.split("/")[0]);
      if (clientId) fd.append("clientId", clientId);

      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        onUrl(data.url);
        onFormat(formatFromFile(file));
        if (!name.trim()) onName(file.name.replace(/\.[^.]+$/, ""));
        setUploadedName(file.name);
      }
    } catch {
      // silently fall back
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["url", "upload"] as const).map((m) => (
          <button
            key={m} type="button"
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {m === "url" ? <Link2 className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
            {m === "url" ? "URL / Link" : "Upload File"}
          </button>
        ))}
      </div>

      {mode === "url" ? (
        <input
          type="text"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://drive.google.com/… or any link"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.ai,.eps,.fig,.sketch,.svg,.zip"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors text-gray-500 hover:text-indigo-600"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
            ) : uploadedName ? (
              <><Check className="w-4 h-4 text-green-600" /> <span className="text-green-700 truncate max-w-xs">{uploadedName}</span></>
            ) : (
              <><Upload className="w-4 h-4" /> Click to upload (jpg, png, svg, pdf, mp4, mp3…)</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Asset Item ───────────────────────────────────────────────

const EMPTY_ASSET = (): BrandAsset => ({
  id: uid(), name: "", type: "logo", variant: "Primary",
  url: "", format: "SVG", notes: "",
});

function AssetFormFields({
  draft, set, clientId,
}: {
  draft: BrandAsset;
  set: (k: keyof BrandAsset, v: string) => void;
  clientId?: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Asset Type">
          <Select
            value={draft.type}
            onChange={(v) => {
            const t = v as AssetType;
            set("type", t);
            set("variant", VARIANTS_BY_TYPE[t]?.[0] ?? "Primary");
            }}
            options={ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        </Field>
        <Field label="Variant">
          <Select
            value={draft.variant}
            onChange={(v) => set("variant", v)}
            options={VARIANTS_BY_TYPE[draft.type].map((v) => ({ value: v, label: v }))}
          />
        </Field>
      </div>
      <Field label="Name *">
        <Input value={draft.name} onChange={(v) => set("name", v)} placeholder="e.g. Primary Logo Dark" />
      </Field>
      <Field label="File or Link">
        <AssetUrlField
          url={draft.url} format={draft.format} name={draft.name}
          onUrl={(v) => set("url", v)}
          onFormat={(v) => set("format", v)}
          onName={(v) => set("name", v)}
          clientId={clientId}
        />
      </Field>
      <Field label="Format">
        <Select
          value={draft.format}
          onChange={(v) => set("format", v)}
          options={FILE_FORMATS.map((f) => ({ value: f, label: f }))}
        />
      </Field>
      <Field label="Usage Notes (optional)">
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          placeholder="e.g. Use on dark backgrounds only. Min size: 32px."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </Field>
    </>
  );
}

function AssetItem({ asset, isEditing, onEdit, onCancel, onSave, onDelete, clientId }: {
  asset: BrandAsset; isEditing: boolean; clientId?: string;
  onEdit: () => void; onCancel: () => void;
  onSave: (updated: BrandAsset) => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState<BrandAsset>(asset);
  const set = (k: keyof BrandAsset, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const handleEditClick = () => { setDraft({ ...asset }); onEdit(); };

  if (!isEditing) {
    const Icon = ASSET_TYPES.find((t) => t.value === asset.type)?.icon ?? Package;
    const typeLabel = ASSET_TYPES.find((t) => t.value === asset.type)?.label ?? asset.type;
    const displayName = asset.name || `${typeLabel} – ${asset.variant}`;
    return (
      <div className="group flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm transition-all">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{displayName}</span>
            {asset.variant && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{asset.variant}</span>}
            {asset.format && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{asset.format}</span>}
          </div>
          {asset.url && (
            <a href={asset.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-500 hover:underline flex items-center gap-1 mt-0.5 w-fit max-w-full">
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-xs">{asset.url}</span>
            </a>
          )}
          {asset.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{asset.notes}</p>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={handleEditClick} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-indigo-300 rounded-xl bg-indigo-50/30 p-4 space-y-3">
      <AssetFormFields draft={draft} set={set} clientId={clientId} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.name.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

function AddAssetForm({ onAdd, onCancel, clientId }: {
  onAdd: (a: BrandAsset) => void; onCancel: () => void; clientId?: string;
}) {
  const [draft, setDraft] = useState<BrandAsset>(EMPTY_ASSET());
  const set = (k: keyof BrandAsset, v: string) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    <div className="border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700">New Asset</p>
      <AssetFormFields draft={draft} set={set} clientId={clientId} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={() => onAdd({ ...draft, id: uid() })}
          disabled={!draft.name.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Asset
        </button>
      </div>
    </div>
  );
}

// ── Main: BrandAssetsEditor ──────────────────────────────────

interface BrandAssetsEditorProps {
  colors: BrandColor[];
  assets: BrandAsset[];
  onColorsChange: (c: BrandColor[]) => void;
  onAssetsChange: (a: BrandAsset[]) => void;
  saving?: boolean;
  onSave?: () => void;
  clientId?: string;
}

export function BrandAssetsEditor({
  colors, assets, onColorsChange, onAssetsChange, saving, onSave, clientId,
}: BrandAssetsEditorProps) {
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [addingColor, setAddingColor] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [addingAsset, setAddingAsset] = useState(false);

  const saveColor  = (u: BrandColor) => { onColorsChange(colors.map((c) => c.id === u.id ? u : c)); setEditingColorId(null); };
  const deleteColor = (id: string)   => onColorsChange(colors.filter((c) => c.id !== id));
  const addColor   = (c: BrandColor) => { onColorsChange([...colors, c]); setAddingColor(false); };

  const saveAsset   = (u: BrandAsset) => { onAssetsChange(assets.map((a) => a.id === u.id ? u : a)); setEditingAssetId(null); };
  const deleteAsset = (id: string)    => onAssetsChange(assets.filter((a) => a.id !== id));
  const addAsset    = (a: BrandAsset) => { onAssetsChange([...assets, a]); setAddingAsset(false); };

  return (
    <div className="space-y-8">
      {/* ── Colors ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Brand Colors</h4>
            <p className="text-xs text-gray-400 mt-0.5">Tag each color with its role in the system</p>
          </div>
          {!addingColor && (
            <button
              onClick={() => { setAddingColor(true); setEditingColorId(null); }}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Color
            </button>
          )}
        </div>
        <div className="space-y-2">
          {colors.map((color) => (
            <ColorItem
              key={color.id} color={color}
              isEditing={editingColorId === color.id}
              onEdit={() => { setEditingColorId(color.id); setAddingColor(false); }}
              onCancel={() => setEditingColorId(null)}
              onSave={saveColor} onDelete={() => deleteColor(color.id)}
            />
          ))}
          {colors.length === 0 && !addingColor && (
            <p className="text-xs text-gray-400 italic px-1">No colors added yet.</p>
          )}
          {addingColor && <AddColorForm onAdd={addColor} onCancel={() => setAddingColor(false)} />}
        </div>
      </section>

      {/* ── Assets ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Brand Assets</h4>
            <p className="text-xs text-gray-400 mt-0.5">Upload files or add links — logos, fonts, guidelines, videos, audio and more</p>
          </div>
          {!addingAsset && (
            <button
              onClick={() => { setAddingAsset(true); setEditingAssetId(null); }}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Asset
            </button>
          )}
        </div>
        <div className="space-y-4">
          {ASSET_GROUPS.map((group) => {
            const items = assets.filter((a) => group.types.includes(a.type));
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                <div className="space-y-2">
                  {items.map((asset) => (
                    <AssetItem
                      key={asset.id} asset={asset} clientId={clientId}
                      isEditing={editingAssetId === asset.id}
                      onEdit={() => { setEditingAssetId(asset.id); setAddingAsset(false); }}
                      onCancel={() => setEditingAssetId(null)}
                      onSave={saveAsset} onDelete={() => deleteAsset(asset.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {assets.length === 0 && !addingAsset && (
            <p className="text-xs text-gray-400 italic px-1">No assets added yet.</p>
          )}
          {addingAsset && <AddAssetForm onAdd={addAsset} onCancel={() => setAddingAsset(false)} clientId={clientId} />}
        </div>
      </section>

      {onSave && (
        <div className="flex justify-end pt-2 border-t border-gray-200">
          <button
            onClick={onSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            Save Brand Assets
          </button>
        </div>
      )}
    </div>
  );
}
