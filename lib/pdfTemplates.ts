/**
 * A4 PDF HTML templates — 7 creative letterhead designs.
 * Rendered via print window — no html2canvas, no oklch issues.
 * All letterhead appearance is driven by CompanySettings + LetterheadConfig JSON.
 */

import type { CompanySettings } from "@/types";
import { formatMoney } from "@/lib/money";

/* ── LetterheadConfig ────────────────────────────────────────── */
export interface LetterheadConfig {
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

const DEFAULT_CFG: LetterheadConfig = {
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

function parseCfg(s: CompanySettings): LetterheadConfig {
  try {
    const raw = (s as unknown as Record<string, unknown>).letterheadConfig as string | null | undefined;
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CFG;
}

/* ── Base CSS ─────────────────────────────────────────────────── */
function baseStyles(accent: string, font: "sans" | "serif"): string {
  const fontStack = font === "serif"
    ? `Georgia, "Times New Roman", Times, serif`
    : `"Helvetica Neue", Helvetica, Arial, sans-serif`;

  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    @page { size: A4 portrait; margin: 14mm 18mm 20mm 18mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ${font === "sans" ? `"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif` : fontStack};
      font-size: 9.5pt;
      color: #1f2937;
      line-height: 1.6;
      background: #fff;
      -webkit-font-smoothing: antialiased;
    }
    h1,h2,h3,h4 { line-height: 1.2; font-weight: 700; }

    /* ── Document header ── */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .doc-title  { font-size: 22pt; font-weight: 800; color: #111827; letter-spacing: -0.8px; }
    .doc-number { font-size: 8.5pt; color: #9ca3af; font-family: monospace; margin-top: 5px; letter-spacing: 0.3px; }
    .doc-meta   { text-align: right; }
    .doc-meta .doc-status { margin-bottom: 6px; }

    /* ── Divider ── */
    .divider { height: 1px; background: #f3f4f6; margin: 16px 0; }
    .divider-accent { height: 2px; background: linear-gradient(90deg, ${accent}, transparent); margin: 16px 0; }

    /* ── Badges ── */
    .badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
    .badge-gray   { background: #f3f4f6; color: #4b5563; }
    .badge-blue   { background: #eff6ff; color: #1d4ed8; }
    .badge-green  { background: #f0fdf4; color: #15803d; }
    .badge-red    { background: #fef2f2; color: #b91c1c; }
    .badge-amber  { background: #fffbeb; color: #92400e; }
    .badge-purple { background: #faf5ff; color: #6d28d9; }
    .badge-indigo { background: #eef2ff; color: #3730a3; }

    /* ── Info grid ── */
    .info-grid   { display: grid; grid-template-columns: 1fr 1fr;     gap: 14px 28px; margin-bottom: 20px; }
    .info-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px 24px; margin-bottom: 20px; }
    .info-block label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; display: block; margin-bottom: 3px; }
    .info-block p     { font-size: 9.5pt; color: #111827; font-weight: 500; }
    .info-block p.sub { font-size: 8.5pt; color: #6b7280; font-weight: 400; }

    /* ── Bill To / From block ── */
    .billing-section { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
    .billing-block { flex: 1; }
    .billing-block label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; display: block; margin-bottom: 5px; }
    .billing-block .company { font-size: 11pt; font-weight: 700; color: #111827; }
    .billing-block .detail  { font-size: 8.5pt; color: #6b7280; line-height: 1.7; }

    /* ── Section heading ── */
    .section-head { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${accent}; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1.5px solid #f3f4f6; }

    /* ── Description block ── */
    .desc-block { background: #f9fafb; border-left: 3px solid ${accent}; padding: 11px 15px; border-radius: 0 8px 8px 0; font-size: 9pt; color: #374151; line-height: 1.65; margin-bottom: 20px; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt; }
    thead tr  { background: ${accent}; }
    thead th  { color: #fff; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 11px; text-align: left; }
    thead th.r { text-align: right; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr  { border-bottom: 1px solid #f3f4f6; }
    tbody td  { padding: 9px 11px; color: #1f2937; vertical-align: top; }
    tbody td.r  { text-align: right; white-space: nowrap; }
    tbody td.sub { font-size: 8pt; color: #6b7280; padding-top: 2px; }
    tfoot tr  { border-top: 2px solid #e5e7eb; }
    tfoot td  { padding: 7px 11px; }

    /* ── Totals ── */
    .totals-wrap  { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-box   { width: 260px; }
    .totals-row   { display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt; color: #4b5563; }
    .totals-row.discount { color: #059669; }
    .totals-row.total    { border-top: 2px solid #e5e7eb; margin-top: 6px; padding-top: 9px; font-size: 11.5pt; font-weight: 800; color: #111827; }
    .totals-row.total .amount { color: ${accent}; }

    /* ── Invoice totals block (right-aligned) ── */
    .totals-block { margin-left: auto; width: 270px; margin-top: 6px; margin-bottom: 24px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; }
    .totals-block .totals-row { display: flex; justify-content: space-between; font-size: 9pt; color: #6b7280; padding: 3.5px 0; }
    .totals-block .totals-row.tax-row { color: #4b5563; }
    .totals-block .totals-row.disc-row { color: #059669; }
    .totals-block .totals-grand { display: flex; justify-content: space-between; align-items: center; font-size: 12.5pt; font-weight: 800; color: #111827; border-top: 2px solid #e5e7eb; margin-top: 10px; padding-top: 10px; }
    .totals-block .totals-grand .grand-amount { color: ${accent}; }

    /* ── Invoice line table ── */
    .line-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 9pt; }
    .line-table thead tr { background: ${accent}; }
    .line-table thead th { color: #fff; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 11px; text-align: left; }
    .line-table tbody td { padding: 10px 11px; color: #1f2937; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .line-table tbody td.desc { color: #374151; }
    .line-table tbody td.desc-note { font-size: 8pt; color: #9ca3af; padding-top: 2px; }
    .line-table tbody tr.row-even { background: #fafafa; }
    .line-table .qty   { text-align: center; width: 64px; color: #4b5563; }
    .line-table .price { text-align: right; width: 96px; color: #4b5563; }
    .line-table .total { text-align: right; width: 96px; font-weight: 600; color: #111827; }

    /* ── Signature ── */
    .sig-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .sig-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
    .sig-card .name { font-weight: 700; font-size: 9.5pt; color: #111827; }
    .sig-card .role { font-size: 8pt; color: #6b7280; margin-bottom: 10px; }
    .sig-card .signed { display: flex; align-items: center; gap: 7px; font-size: 8.5pt; }
    .sig-card .signed .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .sig-card .signed .dot.yes { background: #22c55e; }
    .sig-card .signed .dot.no  { background: #e5e7eb; }
    .sig-card .signed-date { font-size: 7.5pt; color: #6b7280; margin-top: 3px; }
    .sig-card .sig-note    { font-size: 7.5pt; color: #9ca3af; margin-top: 2px; }
    .sig-line  { height: 36px; border-bottom: 1px dashed #d1d5db; margin: 14px 0 4px; }
    .sig-label { font-size: 7pt; color: #9ca3af; }

    /* ── Notes / Terms ── */
    .note-block { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
    .note-block h4 { font-size: 8.5pt; font-weight: 700; color: #374151; margin-bottom: 7px; }
    .note-block p, .note-block pre { font-size: 8.5pt; color: #4b5563; white-space: pre-wrap; font-family: inherit; line-height: 1.65; }

    /* ── Progress ── */
    .progress-wrap { background: #f3f4f6; border-radius: 4px; height: 6px; margin-top: 5px; overflow: hidden; }
    .progress-fill { height: 6px; border-radius: 4px; background: ${accent}; }

    /* ── Task list ── */
    .task-row   { display: flex; align-items: flex-start; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f9fafb; }
    .task-dot   { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
    .task-name  { font-size: 9pt; color: #1f2937; flex: 1; }
    .task-status { font-size: 7.5pt; color: #6b7280; background: #f3f4f6; padding: 2px 7px; border-radius: 10px; flex-shrink: 0; }

    /* ── Page break ── */
    .page-break { page-break-before: always; padding-top: 24px; }

    /* ── Print ── */
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
    }
  `;
}

/* ── Helpers ────────────────────────────────────────────────── */
function fmt(n: number, currency: string) {
  return formatMoney(n, currency, { precision: 2 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
function esc(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function statusBadge(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "badge-gray", SENT: "badge-blue", APPROVED: "badge-green",
    REJECTED: "badge-red", EXPIRED: "badge-amber", CONVERTED: "badge-indigo",
    FULLY_SIGNED: "badge-green", PARTIALLY_SIGNED: "badge-amber",
    TERMINATED: "badge-red",
    TODO: "badge-gray", IN_PROGRESS: "badge-blue", IN_REVIEW: "badge-amber",
    DONE: "badge-green", BLOCKED: "badge-red", ON_HOLD: "badge-gray",
    ACTIVE: "badge-green", COMPLETED: "badge-green",
  };
  return `<span class="badge ${map[status] ?? "badge-gray"}">${status.replace(/_/g, " ")}</span>`;
}
function taskDotColor(status: string) {
  const m: Record<string, string> = {
    DONE: "#22c55e", IN_PROGRESS: "#6366f1", IN_REVIEW: "#f59e0b",
    BLOCKED: "#ef4444", TODO: "#d1d5db", ON_HOLD: "#9ca3af",
  };
  return m[status] ?? "#d1d5db";
}
function wrapHtml(title: string, accent: string, font: "sans" | "serif", body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>${baseStyles(accent, font)}</style>
</head>
<body>${body}</body>
</html>`;
}

/* ── Letterhead builder ────────────────────────────────────── */

// Logo sizing
const LOGO_SIZE: Record<string, string> = {
  sm: "max-height:32px; max-width:100px;",
  md: "max-height:44px; max-width:140px;",
  lg: "max-height:60px; max-width:180px;",
};

// Build logo or initials element
function logoEl(logo: string | null | undefined, name: string, accent: string, cfg: LetterheadConfig, lightMode = false): string {
  const sizeStyle = LOGO_SIZE[cfg.logoSize] ?? LOGO_SIZE.md;
  if (logo) return `<img src="${logo}" alt="${esc(name)}" style="object-fit:contain; display:block; ${sizeStyle}" />`;
  const bg = lightMode ? "rgba(255,255,255,0.25)" : accent;
  const fg = lightMode ? "#fff" : "#fff";
  const sz = cfg.logoSize === "lg" ? "54px" : cfg.logoSize === "sm" ? "34px" : "42px";
  const fs = cfg.logoSize === "lg" ? "18pt" : cfg.logoSize === "sm" ? "13pt" : "16pt";
  return `<div style="width:${sz}; height:${sz}; border-radius:10px; background:${bg}; color:${fg}; font-size:${fs}; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${esc(name.charAt(0).toUpperCase())}</div>`;
}

// Build contact info lines for light/dark backgrounds
function contactLines(s: CompanySettings, cfg: LetterheadConfig, lightBg = false): string {
  const col = lightBg ? "rgba(255,255,255,0.75)" : "#6b7280";
  const parts: string[] = [];
  if (cfg.showAddress && s.letterheadAddress) parts.push(esc(s.letterheadAddress.replace(/\n/g, " · ")));
  if (cfg.showPhone   && s.letterheadPhone)   parts.push(esc(s.letterheadPhone));
  if (cfg.showEmail   && s.letterheadEmail)   parts.push(esc(s.letterheadEmail));
  if (cfg.showWebsite && s.letterheadWebsite) parts.push(esc(s.letterheadWebsite));
  if (!parts.length) return "";
  return parts.map(p => `<div style="font-size:8pt; color:${col}; line-height:1.7;">${p}</div>`).join("");
}

export function letterheadHtml(s: CompanySettings): string {
  const cfg      = parseCfg(s);
  const template = s.letterheadTemplate ?? "CLASSIC";
  const accent   = s.letterheadColor ?? "#6366f1";
  const name     = s.letterheadHeader || s.name || "Agency";
  const logo     = s.letterheadLogoUrl || s.logoUrl;
  const hBg      = cfg.headerBg ?? "#1e293b";
  const isLight  = cfg.headerTextColor === "light";
  const textCol  = isLight ? "#fff" : "#111827";

  // Logo justify based on logoPosition
  const logoJustify = cfg.logoPosition === "center" ? "center" : cfg.logoPosition === "right" ? "flex-end" : "flex-start";

  const lEl = logoEl(logo, name, accent, cfg, isLight);
  const contact = contactLines(s, cfg, false);
  const contactLight = contactLines(s, cfg, true);
  const agencyName  = cfg.showAgencyName ? name : "";

  // ── CLASSIC ───────────────────────────────────────────────
  if (template === "CLASSIC") {
    return `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; border-bottom:3px solid ${accent}; padding-bottom:16px; margin-bottom:22px;">
      <div style="display:flex; align-items:center; gap:12px; justify-content:${logoJustify};">
        ${lEl}
        ${agencyName ? `<div><div style="font-size:15pt; font-weight:800; color:#111827;">${esc(agencyName)}</div></div>` : ""}
      </div>
      <div style="text-align:right;">${contact}</div>
    </div>`;
  }

  // ── MODERN ────────────────────────────────────────────────
  if (template === "MODERN") {
    return `
    <div style="display:flex; align-items:stretch; gap:0; border-bottom:1px solid #e5e7eb; padding-bottom:0; margin-bottom:22px;">
      <div style="width:5px; background:${accent}; border-radius:3px 0 0 3px; flex-shrink:0; margin-right:14px;"></div>
      <div style="flex:1; display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px; justify-content:${logoJustify};">
          ${lEl}
          <div>
            ${agencyName ? `<div style="font-size:14pt; font-weight:800; color:#111827;">${esc(agencyName)}</div>` : ""}
            <div style="width:32px; height:3px; background:${accent}; border-radius:2px; margin-top:5px;"></div>
          </div>
        </div>
        <div style="text-align:right;">${contact}</div>
      </div>
    </div>`;
  }

  // ── MINIMAL ───────────────────────────────────────────────
  if (template === "MINIMAL") {
    return `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:12px; border-bottom:1.5px solid ${accent}; margin-bottom:22px;">
      <div style="justify-content:${logoJustify}; display:flex; align-items:center; gap:12px;">
        ${logo ? `<img src="${logo}" alt="${esc(name)}" style="object-fit:contain; ${LOGO_SIZE[cfg.logoSize] ?? LOGO_SIZE.md}" />` : ""}
        ${agencyName ? `<div style="font-size:14pt; font-weight:700; color:#111827; letter-spacing:-0.3px;">${esc(agencyName)}</div>` : ""}
      </div>
      <div style="text-align:right;">${contactLines(s, cfg, false)}</div>
    </div>`;
  }

  // ── BOLD ──────────────────────────────────────────────────
  if (template === "BOLD") {
    const lElLight = logoEl(logo, name, accent, cfg, true);
    return `
    <div style="background:${hBg}; border-radius:10px; padding:20px 24px; margin-bottom:22px; display:flex; align-items:center; justify-content:space-between; gap:20px;">
      <div style="display:flex; align-items:center; gap:14px; justify-content:${logoJustify};">
        ${lElLight}
        ${agencyName ? `<div>
          <div style="font-size:17pt; font-weight:800; color:${textCol}; letter-spacing:-0.3px;">${esc(agencyName)}</div>
          <div style="width:36px; height:3px; background:${accent}; border-radius:2px; margin-top:6px;"></div>
        </div>` : ""}
      </div>
      <div style="text-align:right;">${contactLight}</div>
    </div>`;
  }

  // ── ELEGANT ───────────────────────────────────────────────
  if (template === "ELEGANT") {
    const contactParts: string[] = [];
    if (cfg.showAddress && s.letterheadAddress) contactParts.push(esc(s.letterheadAddress.replace(/\n/g, " · ")));
    if (cfg.showPhone   && s.letterheadPhone)   contactParts.push(esc(s.letterheadPhone));
    if (cfg.showEmail   && s.letterheadEmail)   contactParts.push(esc(s.letterheadEmail));
    if (cfg.showWebsite && s.letterheadWebsite) contactParts.push(esc(s.letterheadWebsite));
    const contactStr = contactParts.join(`<span style="color:#d1d5db; margin:0 8px;">·</span>`);
    return `
    <div style="text-align:center; margin-bottom:22px;">
      <div style="width:60px; height:1.5px; background:${accent}30; margin:0 auto 14px;"></div>
      <div style="display:flex; justify-content:center; margin-bottom:10px;">${logoEl(logo, name, accent, cfg, false)}</div>
      ${agencyName ? `<div style="font-size:15pt; font-weight:700; color:#111827; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">${esc(agencyName)}</div>` : ""}
      ${contactStr ? `<div style="font-size:8pt; color:#9ca3af; margin-top:4px;">${contactStr}</div>` : ""}
      <div style="display:flex; align-items:center; gap:10px; margin-top:14px;">
        <div style="flex:1; height:1px; background:#e5e7eb;"></div>
        <div style="width:6px; height:6px; border-radius:50%; background:${accent};"></div>
        <div style="flex:1; height:1px; background:#e5e7eb;"></div>
      </div>
    </div>`;
  }

  // ── SPLIT ────────────────────────────────────────────────
  if (template === "SPLIT") {
    const lElLight = logoEl(logo, name, accent, cfg, true);
    return `
    <div style="display:grid; grid-template-columns:38% 62%; border-radius:10px; overflow:hidden; margin-bottom:22px; border:1px solid ${hBg}20;">
      <div style="background:${hBg}; padding:20px 18px; display:flex; flex-direction:column; justify-content:center; gap:10px;">
        <div style="display:flex; justify-content:${logoJustify};">${lElLight}</div>
        ${agencyName ? `<div style="font-size:13pt; font-weight:800; color:${textCol}; line-height:1.2; margin-top:4px;">${esc(agencyName)}</div>` : ""}
        <div style="width:32px; height:2px; background:${accent}; border-radius:2px;"></div>
      </div>
      <div style="background:#f8fafc; padding:20px 18px; display:flex; flex-direction:column; justify-content:center; gap:3px; border-left:1px solid ${hBg}15;">
        ${contactLines(s, cfg, false)}
      </div>
    </div>`;
  }

  // ── EXECUTIVE (default) ───────────────────────────────────
  {
    const lElLight = logoEl(logo, name, accent, cfg, true);
    return `
    <div style="background:${hBg}; padding:22px 28px; margin-bottom:24px; border-radius:0;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:20px;">
        <div style="display:flex; align-items:center; gap:16px; justify-content:${logoJustify};">
          ${lElLight}
          <div>
            ${agencyName ? `<div style="color:${accent}; font-size:19pt; font-weight:800; letter-spacing:-0.5px;">${esc(agencyName)}</div>` : ""}
            <div style="width:40px; height:2px; background:rgba(255,255,255,0.3); border-radius:2px; margin-top:6px;"></div>
          </div>
        </div>
        <div style="text-align:right; border-left:1px solid rgba(255,255,255,0.12); padding-left:20px;">
          ${contactLight}
        </div>
      </div>
    </div>`;
  }
}

export function footerHtml(s: CompanySettings): string {
  const cfg = parseCfg(s);
  const accent = s.letterheadColor ?? "#6366f1";
  const text   = s.letterheadFooter ?? "This is a computer-generated document.";
  const align  = cfg.footerAlign ?? "center";
  const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
  const justify = justifyMap[align] ?? "center";

  const leftItem  = cfg.showFooterDate
    ? `<span>Generated: ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</span>`
    : `<span>${esc(s.name ?? "Agency")}</span>`;
  const rightItem = cfg.showFooterPageNum ? `<span>Page 1</span>` : `<span></span>`;

  return `
  <div style="position:fixed; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:8px 18mm; border-top:1px solid ${accent}30; font-size:7.5pt; color:#9ca3af;">
    ${leftItem}
    <span style="text-align:${align}; flex:1; padding:0 16px;">${esc(text)}</span>
    ${rightItem}
  </div>`;
}

/* ── CONTRACT ─────────────────────────────────────────────── */
export interface ContractPartyPdf {
  name: string;
  email?: string | null;
  partyType: string;
  signedAt?: string | null;
  signatureNote?: string | null;
}
export interface ContractPdfData {
  title: string;
  type: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  value?: number | null;
  currency: string;
  notes?: string | null;
  project?: { name: string } | null;
  client?: { name: string; companyName?: string | null } | null;
  parties: ContractPartyPdf[];
}

export function buildContractHtml(c: ContractPdfData, s: CompanySettings): string {
  const cfg    = parseCfg(s);
  const accent = s.letterheadColor ?? "#6366f1";

  const typeLabel: Record<string, string> = {
    NDA: "Non-Disclosure Agreement", SERVICE_AGREEMENT: "Service Agreement",
    EMPLOYMENT: "Employment Agreement", FREELANCE: "Freelance Contract",
    PARTNERSHIP: "Partnership Agreement", OTHER: "Contract",
  };
  const partyTypeLabel: Record<string, string> = {
    CLIENT: "Client", STAKEHOLDER: "Freelancer / Vendor", USER: "Agency",
  };

  const signedCount = c.parties.filter(p => p.signedAt).length;
  const totalCount  = c.parties.length;
  const progressPct = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;

  const partiesRows = c.parties.map(p => {
    const signed = !!p.signedAt;
    return `
      <div class="sig-card">
        <div class="name">${esc(p.name)}</div>
        <div class="role">${partyTypeLabel[p.partyType] ?? p.partyType}${p.email ? ` · ${esc(p.email)}` : ""}</div>
        <div class="signed">
          <div class="dot ${signed ? "yes" : "no"}"></div>
          <span style="color:${signed ? "#16a34a" : "#9ca3af"}; font-weight:${signed ? "700" : "400"};">${signed ? "Signed" : "Pending signature"}</span>
        </div>
        ${signed && p.signedAt ? `<div class="signed-date">${fmtDate(p.signedAt)}</div>` : ""}
        ${signed && p.signatureNote ? `<div class="sig-note">${esc(p.signatureNote)}</div>` : ""}
        ${!signed ? `<div class="sig-line"></div><div class="sig-label">Signature</div>` : ""}
      </div>`;
  }).join("");

  const body = `
    ${letterheadHtml(s)}
    <div class="doc-header">
      <div>
        <div class="doc-title">${esc((typeLabel[c.type] ?? "Contract").toUpperCase())}</div>
        <div class="doc-number">${esc(c.title)}</div>
      </div>
      ${statusBadge(c.status)}
    </div>
    <div class="info-grid-3" style="margin-bottom:18px;">
      <div class="info-block"><label>Contract Type</label><p>${esc(typeLabel[c.type] ?? c.type)}</p></div>
      ${c.client  ? `<div class="info-block"><label>Client</label><p>${esc(c.client.companyName || c.client.name)}</p></div>` : ""}
      ${c.project ? `<div class="info-block"><label>Project</label><p>${esc(c.project.name)}</p></div>` : ""}
      ${c.startDate ? `<div class="info-block"><label>Effective Date</label><p>${fmtDate(c.startDate)}</p></div>` : ""}
      ${c.endDate   ? `<div class="info-block"><label>Expiry Date</label><p>${fmtDate(c.endDate)}</p></div>` : ""}
      ${c.value != null ? `<div class="info-block"><label>Contract Value</label><p style="font-weight:700;">${fmt(c.value, c.currency)}</p></div>` : ""}
    </div>
    <p class="section-head">Signature Progress (${signedCount} of ${totalCount} signed)</p>
    <div class="progress-wrap" style="margin-bottom:14px;"><div class="progress-fill" style="width:${progressPct}%;"></div></div>
    <p class="section-head">Parties</p>
    <div class="sig-grid">${partiesRows}</div>
    ${c.notes ? `<div class="note-block"><h4>Notes</h4><p>${esc(c.notes)}</p></div>` : ""}
    ${footerHtml(s)}`;

  return wrapHtml(c.title, accent, cfg.font, body);
}

/* ── PROJECT ──────────────────────────────────────────────── */
export interface ProjectTaskPdf {
  title: string;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  assignee?: { name: string } | null;
}
export interface ProjectPdfData {
  name: string;
  status: string;
  type: string;
  description?: string | null;
  budget?: number | null;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
  progress: number;
  client?: { name: string; companyName?: string | null } | null;
  tasks: ProjectTaskPdf[];
}

export function buildProjectHtml(p: ProjectPdfData, s: CompanySettings): string {
  const cfg    = parseCfg(s);
  const accent = s.letterheadColor ?? "#6366f1";

  const tasksByStatus = p.tasks.reduce<Record<string, ProjectTaskPdf[]>>((acc, t) => {
    if (!acc[t.status]) acc[t.status] = [];
    acc[t.status].push(t);
    return acc;
  }, {});
  const statusOrder = ["IN_PROGRESS", "IN_REVIEW", "TODO", "BLOCKED", "DONE", "ON_HOLD"];
  const statusLabel: Record<string, string> = {
    TODO: "To Do", IN_PROGRESS: "In Progress", IN_REVIEW: "In Review",
    DONE: "Done", BLOCKED: "Blocked", ON_HOLD: "On Hold",
  };

  const tasksHtml = statusOrder.filter(st => tasksByStatus[st]?.length).map(st => {
    const rows = tasksByStatus[st].map(t => `
      <div class="task-row">
        <div class="task-dot" style="background:${taskDotColor(st)};"></div>
        <div class="task-name">${esc(t.title)}${t.assignee ? `<span style="color:#9ca3af; font-size:8pt;"> · ${esc(t.assignee.name)}</span>` : ""}</div>
        ${t.dueDate ? `<span style="font-size:7.5pt; color:#9ca3af;">${fmtDate(t.dueDate)}</span>` : ""}
      </div>`).join("");
    return `<div style="margin-bottom:14px;"><div style="font-size:8pt; font-weight:700; color:#374151; margin-bottom:4px;">${statusLabel[st]} (${tasksByStatus[st].length})</div>${rows}</div>`;
  }).join("");

  const doneCount  = tasksByStatus["DONE"]?.length ?? 0;
  const inpCount   = tasksByStatus["IN_PROGRESS"]?.length ?? 0;
  const totalTasks = p.tasks.length;

  const body = `
    ${letterheadHtml(s)}
    <div class="doc-header">
      <div>
        <div class="doc-title">PROJECT SUMMARY</div>
        <div class="doc-number">${esc(p.name)}</div>
      </div>
      ${statusBadge(p.status)}
    </div>
    <div class="info-grid-3" style="margin-bottom:18px;">
      ${p.client ? `<div class="info-block"><label>Client</label><p>${esc(p.client.companyName || p.client.name)}</p></div>` : ""}
      <div class="info-block"><label>Type</label><p>${p.type === "RETAINER" ? "Retainer" : "One-Time"}</p></div>
      ${p.budget != null ? `<div class="info-block"><label>Budget</label><p style="font-weight:700;">${fmt(p.budget, p.currency ?? "USD")}</p></div>` : ""}
      ${p.startDate ? `<div class="info-block"><label>Start Date</label><p>${fmtDate(p.startDate)}</p></div>` : ""}
      ${p.endDate   ? `<div class="info-block"><label>End Date</label><p>${fmtDate(p.endDate)}</p></div>` : ""}
      <div class="info-block"><label>Tasks</label><p>${totalTasks} total · ${doneCount} done · ${inpCount} in progress</p></div>
    </div>
    <p class="section-head">Progress — ${p.progress}% Complete</p>
    <div class="progress-wrap" style="margin-bottom:18px;"><div class="progress-fill" style="width:${p.progress}%;"></div></div>
    ${p.description ? `<p class="section-head">Description</p><div class="desc-block">${esc(p.description)}</div>` : ""}
    ${totalTasks > 0 ? `<p class="section-head">Tasks (${totalTasks})</p>${tasksHtml}` : ""}
    ${footerHtml(s)}`;

  return wrapHtml(`Project — ${p.name}`, accent, cfg.font, body);
}

/* ── Invoice PDF ──────────────────────────────────────────────── */
export interface InvoicePdfData {
  invoiceNumber: string;
  status:        string;
  dueDate:       string | null;
  paidAt:        string | null;
  currency:      string;
  discountPct:   number | null;
  taxPct:        number | null;
  notes:         string | null;
  client:        { id: string; name: string; companyName: string | null } | null;
  project:       { id: string; name: string } | null;
  lineItems:     { description: string; quantity: number; unitPrice: number; unit: string | null; isFree?: boolean; kind?: string }[];
}

export function buildInvoiceHtml(inv: InvoicePdfData, s: CompanySettings): string {
  const cfg    = parseCfg(s);
  const accent = s.letterheadColor || "#6366f1";

  // v3: complimentary lines are listed in their own section with the tag, at
  // the token amount they were invoiced at, so the client sees the goodwill
  // rather than a silent zero (docs/V3_CONTEXT.md §3). v2's genuinely
  // zero-rated lines land in the same section.
  const isComplimentary = (li: { isFree?: boolean; kind?: string }) =>
    li.kind === "COMPLIMENTARY" || li.isFree;
  const billed = inv.lineItems.filter((li) => !isComplimentary(li));
  const freeLines = inv.lineItems.filter(isComplimentary);

  const subtotal = billed.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  // The token amounts still belong in the total, or the invoice wouldn't add up.
  const complimentaryTotal = freeLines.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const disc     = subtotal * ((inv.discountPct ?? 0) / 100);
  const tax      = (subtotal - disc) * ((inv.taxPct ?? 0) / 100);
  const total    = subtotal - disc + tax + complimentaryTotal;

  const fmtStatus: Record<string, string> = {
    DRAFT: "badge-gray", SENT: "badge-blue", PAID: "badge-green",
    OVERDUE: "badge-red", CANCELLED: "badge-gray",
  };
  const statusLabel: Record<string, string> = {
    DRAFT: "Draft", SENT: "Sent", PAID: "Paid", OVERDUE: "Overdue", CANCELLED: "Cancelled",
  };

  const rows = billed.map((li, i) => `
    <tr class="${i % 2 !== 0 ? "row-even" : ""}">
      <td class="desc">${esc(li.description)}</td>
      <td class="qty">${li.quantity}${li.unit ? `<br/><span style="font-size:7.5pt;color:#9ca3af;">${esc(li.unit)}</span>` : ""}</td>
      <td class="price">${fmt(li.unitPrice, inv.currency)}</td>
      <td class="total">${fmt(li.quantity * li.unitPrice, inv.currency)}</td>
    </tr>
  `).join("");

  const complimentaryRows = freeLines.map((li) => `
    <tr>
      <td class="desc">${esc(li.description)}</td>
      <td class="qty">${li.quantity}</td>
      <td class="price" style="color:#15803d;font-weight:600;">Complimentary</td>
      <td class="total" style="color:#15803d;">${fmt(li.quantity * li.unitPrice, inv.currency)}</td>
    </tr>
  `).join("");


  const agencyName = s.name || "Agency";

  const body = `
    ${letterheadHtml(s)}

    <div class="doc-header">
      <div>
        <div class="doc-title">Invoice</div>
        <div class="doc-number">#${esc(inv.invoiceNumber)}</div>
      </div>
      <div class="doc-meta">
        <div class="doc-status"><span class="badge ${fmtStatus[inv.status] ?? "badge-gray"}">${statusLabel[inv.status] ?? inv.status}</span></div>
        ${inv.dueDate ? `<div style="font-size:8.5pt;color:#6b7280;margin-top:4px;">Due <strong style="color:#374151;">${fmtDate(inv.dueDate)}</strong></div>` : ""}
        ${inv.paidAt  ? `<div style="font-size:8.5pt;color:#15803d;margin-top:3px;font-weight:600;">✓ Paid ${fmtDate(inv.paidAt)}</div>` : ""}
      </div>
    </div>

    <div class="divider-accent"></div>

    <div class="billing-section">
      ${inv.client ? `
      <div class="billing-block">
        <label>Bill To</label>
        <div class="company">${esc(inv.client.companyName ?? inv.client.name)}</div>
        ${inv.client.companyName ? `<div class="detail">${esc(inv.client.name)}</div>` : ""}
      </div>` : ""}
      <div class="billing-block" style="text-align:right;">
        <label>From</label>
        <div class="company">${esc(agencyName)}</div>
        ${s.email ? `<div class="detail">${esc(s.email)}</div>` : ""}
        ${s.phone ? `<div class="detail">${esc(s.phone)}</div>` : ""}
      </div>
    </div>

    ${inv.project ? `
    <div class="info-grid-3" style="margin-bottom:16px;">
      <div class="info-block"><label>Project</label><p>${esc(inv.project.name)}</p></div>
    </div>` : ""}

    <p class="section-head">Line Items</p>
    <table class="line-table" style="margin-bottom:6px;">
      <thead>
        <tr>
          <th style="text-align:left;">Description</th>
          <th class="qty" style="text-align:center;">Qty</th>
          <th class="price" style="text-align:right;">Unit Price</th>
          <th class="total" style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px;">No line items</td></tr>`}</tbody>
    </table>

    ${freeLines.length ? `
    <p class="section-head" style="color:#15803d;">Complimentary</p>
    <table class="line-table" style="margin-bottom:6px;">
      <tbody>${complimentaryRows}</tbody>
    </table>` : ""}

    <div class="totals-block">
      <div class="totals-row"><span>Subtotal</span><span>${fmt(subtotal, inv.currency)}</span></div>
      ${disc > 0 ? `<div class="totals-row disc-row"><span>Discount (${inv.discountPct}%)</span><span>−${fmt(disc, inv.currency)}</span></div>` : ""}
      ${tax > 0  ? `<div class="totals-row tax-row"><span>Tax (${inv.taxPct}%)</span><span>+${fmt(tax, inv.currency)}</span></div>` : ""}
      <div class="totals-grand"><span>Total Due</span><span class="grand-amount">${fmt(total, inv.currency)}</span></div>
    </div>

    ${inv.notes ? `
    <div style="margin-top:8px;">
      <p class="section-head">Notes &amp; Payment Terms</p>
      <div class="note-block"><p>${esc(inv.notes)}</p></div>
    </div>` : ""}

    ${footerHtml(s)}`;

  return wrapHtml(`Invoice ${inv.invoiceNumber}`, accent, cfg.font, body);
}
