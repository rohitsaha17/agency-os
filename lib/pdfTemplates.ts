/**
 * Clean A4 PDF HTML templates for Quotations, Contracts, and Projects.
 * Rendered in a print window — no html2canvas, no oklch issues.
 * Letterhead is injected from CompanySettings.
 */

import type { CompanySettings } from "@/types";

/* ─────────────────────────────────────────────────────────────
   Base styles — shared across all templates
   ───────────────────────────────────────────────────────────── */
function baseStyles(accent: string) {
  return `
    @page { size: A4 portrait; margin: 18mm 18mm 22mm 18mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      color: #1f2937;
      line-height: 1.55;
      background: #fff;
    }

    h1,h2,h3,h4 { line-height: 1.25; font-weight: 700; }

    /* Letterhead wrapper */
    .lh { padding-bottom: 12px; margin-bottom: 20px; }

    /* CLASSIC */
    .lh-classic {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 20px;
      border-bottom: 3px solid ${accent};
      padding-bottom: 14px;
    }
    .lh-classic-left h1 { font-size: 15pt; color: #111827; }
    .lh-classic-left .tagline { font-size: 8pt; color: #6b7280; margin-top: 2px; }
    .lh-classic-right { text-align: right; font-size: 8pt; color: #6b7280; line-height: 1.6; }

    /* MODERN */
    .lh-modern {
      display: flex; align-items: stretch; gap: 0;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0;
    }
    .lh-modern-bar { width: 5px; background: ${accent}; border-radius: 3px; flex-shrink: 0; margin-right: 14px; }
    .lh-modern-content { flex: 1; display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; }
    .lh-modern-left h1 { font-size: 14pt; color: #111827; }
    .lh-modern-left .accent-line { width: 32px; height: 3px; background: ${accent}; border-radius: 2px; margin-top: 5px; }
    .lh-modern-right { text-align: right; font-size: 8pt; color: #6b7280; line-height: 1.6; }

    /* MINIMAL */
    .lh-minimal {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding-bottom: 10px;
      border-bottom: 1.5px solid ${accent};
    }
    .lh-minimal-left h1 { font-size: 14pt; color: #111827; letter-spacing: -0.3px; }
    .lh-minimal-right { text-align: right; font-size: 8pt; color: #9ca3af; line-height: 1.6; }

    /* Logo */
    .lh-logo { max-height: 44px; max-width: 140px; object-fit: contain; display: block; margin-bottom: 6px; }
    .lh-initials {
      width: 38px; height: 38px; border-radius: 8px;
      background: ${accent};
      color: #fff; font-size: 16pt; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 6px;
    }

    /* Document title area */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
    .doc-title { font-size: 20pt; font-weight: 800; color: #111827; letter-spacing: -0.5px; }
    .doc-number { font-size: 9pt; color: #6b7280; font-family: monospace; margin-top: 4px; }
    .badge {
      display: inline-block; padding: 4px 10px; border-radius: 20px;
      font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .badge-gray   { background: #f3f4f6; color: #374151; }
    .badge-blue   { background: #eff6ff; color: #1d4ed8; }
    .badge-green  { background: #f0fdf4; color: #15803d; }
    .badge-red    { background: #fef2f2; color: #b91c1c; }
    .badge-amber  { background: #fffbeb; color: #b45309; }
    .badge-purple { background: #faf5ff; color: #7c3aed; }
    .badge-indigo { background: #eef2ff; color: #4338ca; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 18px; }
    .info-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px 24px; margin-bottom: 18px; }
    .info-block label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9ca3af; display: block; margin-bottom: 2px; }
    .info-block p { font-size: 9.5pt; color: #111827; }
    .info-block p.mono { font-family: monospace; font-size: 9pt; }
    .info-block p.sub  { font-size: 8.5pt; color: #6b7280; }

    /* Section heading */
    .section-head { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: ${accent}; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #f3f4f6; }

    /* Description block */
    .desc-block { background: #f9fafb; border-left: 3px solid ${accent}; padding: 10px 14px; border-radius: 0 6px 6px 0; font-size: 9pt; color: #374151; line-height: 1.6; margin-bottom: 18px; }

    /* Table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    thead tr { background: ${accent}; }
    thead th { color: #fff; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 7px 10px; text-align: left; }
    thead th.r { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody td { padding: 8px 10px; font-size: 9pt; color: #1f2937; vertical-align: top; }
    tbody td.r { text-align: right; white-space: nowrap; }
    tbody td.sub { font-size: 8pt; color: #6b7280; padding-top: 2px; }
    tfoot tr { border-top: 2px solid #e5e7eb; }
    tfoot td { padding: 6px 10px; font-size: 9pt; }

    /* Totals */
    .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 18px; }
    .totals-box { width: 240px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 9pt; color: #4b5563; }
    .totals-row.discount { color: #059669; }
    .totals-row.total { border-top: 2px solid #e5e7eb; margin-top: 4px; padding-top: 8px; font-size: 11pt; font-weight: 800; color: #111827; }
    .totals-row.total .amount { color: ${accent}; }

    /* Signature block */
    .sig-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .sig-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .sig-card .name { font-weight: 700; font-size: 9.5pt; color: #111827; }
    .sig-card .role { font-size: 8pt; color: #6b7280; margin-bottom: 8px; }
    .sig-card .signed { display: flex; align-items: center; gap: 6px; font-size: 8.5pt; }
    .sig-card .signed .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .sig-card .signed .dot.yes { background: #22c55e; }
    .sig-card .signed .dot.no  { background: #e5e7eb; }
    .sig-card .signed-date { font-size: 7.5pt; color: #6b7280; margin-top: 3px; }
    .sig-card .sig-note { font-size: 7.5pt; color: #9ca3af; margin-top: 2px; }
    .sig-line { height: 32px; border-bottom: 1px dashed #d1d5db; margin: 12px 0 4px; }
    .sig-label { font-size: 7pt; color: #9ca3af; }

    /* Notes / Terms */
    .note-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .note-block h4 { font-size: 8.5pt; font-weight: 700; color: #374151; margin-bottom: 6px; }
    .note-block p, .note-block pre { font-size: 8.5pt; color: #4b5563; white-space: pre-wrap; font-family: inherit; line-height: 1.6; }

    /* Progress bar */
    .progress-wrap { background: #f3f4f6; border-radius: 4px; height: 6px; margin-top: 4px; }
    .progress-fill { height: 6px; border-radius: 4px; background: ${accent}; }

    /* Task list */
    .task-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f9fafb; }
    .task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
    .task-name { font-size: 9pt; color: #1f2937; flex: 1; }
    .task-status { font-size: 7.5pt; color: #6b7280; background: #f3f4f6; padding: 1px 6px; border-radius: 10px; flex-shrink: 0; }

    /* Footer */
    .footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 18mm;
      border-top: 1px solid ${accent}30;
      font-size: 7.5pt; color: #9ca3af;
    }

    /* Page break */
    .page-break { page-break-before: always; padding-top: 24px; }

    /* Print */
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
    }
  `;
}

/* ─────────────────────────────────────────────────────────────
   Letterhead header HTML
   ───────────────────────────────────────────────────────────── */
function letterheadHtml(s: CompanySettings): string {
  const template = s.letterheadTemplate ?? "CLASSIC";
  const accent   = s.letterheadColor ?? "#6366f1";
  const name     = s.letterheadHeader || s.name || "Agency";
  const logo     = s.letterheadLogoUrl || s.logoUrl;
  const initials = name.charAt(0).toUpperCase();

  const logoImg = logo
    ? `<img src="${logo}" alt="${name}" class="lh-logo" />`
    : `<div class="lh-initials">${initials}</div>`;

  const contact = [
    s.letterheadAddress?.replace(/\n/g, " · ") ?? "",
    s.letterheadPhone   ?? "",
    s.letterheadEmail   ?? "",
    s.letterheadWebsite ?? "",
  ].filter(Boolean).join("<br/>");

  if (template === "MODERN") {
    return `
      <div class="lh">
        <div class="lh-modern">
          <div class="lh-modern-bar"></div>
          <div class="lh-modern-content">
            <div class="lh-modern-left">
              ${logoImg}
              <h1>${name}</h1>
              <div class="accent-line"></div>
            </div>
            <div class="lh-modern-right">${contact}</div>
          </div>
        </div>
      </div>`;
  }

  if (template === "MINIMAL") {
    return `
      <div class="lh">
        <div class="lh-minimal">
          <div class="lh-minimal-left">
            ${logo ? `<img src="${logo}" alt="${name}" class="lh-logo" style="margin-bottom:4px;" />` : ""}
            <h1>${name}</h1>
          </div>
          <div class="lh-minimal-right">${contact}</div>
        </div>
      </div>`;
  }

  // CLASSIC (default)
  return `
    <div class="lh">
      <div class="lh-classic">
        <div class="lh-classic-left">
          ${logoImg}
          <h1>${name}</h1>
        </div>
        <div class="lh-classic-right">${contact}</div>
      </div>
    </div>`;
}

function footerHtml(s: CompanySettings): string {
  const text = s.letterheadFooter ?? "This is a computer-generated document.";
  return `
    <div class="footer">
      <span>${text}</span>
      <span>${s.name ?? "Agency"}</span>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(n);
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
  const cls = map[status] ?? "badge-gray";
  const label = status.replace(/_/g, " ");
  return `<span class="badge ${cls}">${label}</span>`;
}
function taskDotColor(status: string) {
  const m: Record<string, string> = {
    DONE: "#22c55e", IN_PROGRESS: "#6366f1", IN_REVIEW: "#f59e0b",
    BLOCKED: "#ef4444", TODO: "#d1d5db", ON_HOLD: "#9ca3af",
  };
  return m[status] ?? "#d1d5db";
}
function wrapHtml(title: string, accent: string, styles: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>${styles}</style>
</head>
<body>${body}</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────
   QUOTATION template
   ───────────────────────────────────────────────────────────── */
export interface QuotationPdfData {
  number: string;
  title: string;
  status: string;
  pricingType: string;
  currency: string;
  createdAt: string;
  validUntil?: string | null;
  description?: string | null;
  notes?: string | null;
  terms?: string | null;
  subtotal: number;
  discountType?: string | null;
  discountValue?: number;
  taxRate?: number;
  total: number;
  client?: { name: string; companyName?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  lineItems: { title: string; description?: string | null; pricingType: string; quantity: number; unitPrice: number; subtotal: number; unit?: string | null }[];
}

export function buildQuotationHtml(q: QuotationPdfData, s: CompanySettings): string {
  const accent = s.letterheadColor ?? "#6366f1";

  const subtotal      = Number(q.subtotal);
  const discountValue = Number(q.discountValue ?? 0);
  const taxRate       = Number(q.taxRate ?? 0);
  const discountAmt   = q.discountType === "PERCENT"
    ? (subtotal * discountValue) / 100
    : q.discountType === "AMOUNT" ? discountValue : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmt);
  const taxAmt        = (afterDiscount * taxRate) / 100;

  const pricingLabel: Record<string, string> = { FIXED: "Fixed", PER_ITEM: "Per Item", RETAINER: "Retainer/mo" };

  const lineItemsRows = q.lineItems.map((item, i) => `
    <tr>
      <td style="width:36px; color:#9ca3af; font-size:8pt;">${i + 1}</td>
      <td>
        <div style="font-weight:600; color:#111827;">${esc(item.title)}</div>
        ${item.description ? `<div class="sub">${esc(item.description)}</div>` : ""}
      </td>
      <td class="r" style="width:70px; color:#6b7280; font-size:8.5pt;">${pricingLabel[item.pricingType] ?? item.pricingType}</td>
      <td class="r" style="width:50px;">${item.pricingType !== "FIXED" ? Number(item.quantity) + (item.unit ? " " + item.unit : "") : "—"}</td>
      <td class="r" style="width:90px;">${fmt(Number(item.unitPrice), q.currency)}</td>
      <td class="r" style="width:90px; font-weight:600;">${fmt(Number(item.subtotal), q.currency)}</td>
    </tr>`).join("");

  const totalsRows = `
    <div class="totals-row"><span>Subtotal</span><span>${fmt(subtotal, q.currency)}</span></div>
    ${discountAmt > 0 ? `<div class="totals-row discount"><span>Discount${q.discountType === "PERCENT" ? ` (${discountValue}%)` : ""}</span><span>− ${fmt(discountAmt, q.currency)}</span></div>` : ""}
    ${taxRate > 0 ? `<div class="totals-row"><span>Tax (${taxRate}%)</span><span>${fmt(taxAmt, q.currency)}</span></div>` : ""}
    <div class="totals-row total"><span>Total</span><span class="amount">${fmt(Number(q.total), q.currency)}</span></div>`;

  const clientBlock = q.client ? `
    <div class="info-block">
      <label>Bill To</label>
      <p>${esc(q.client.companyName || q.client.name)}</p>
      ${q.client.companyName ? `<p class="sub">${esc(q.client.name)}</p>` : ""}
      ${q.client.email  ? `<p class="sub">${esc(q.client.email)}</p>` : ""}
      ${q.client.phone  ? `<p class="sub">${esc(q.client.phone)}</p>` : ""}
      ${q.client.address? `<p class="sub">${esc(q.client.address)}</p>` : ""}
    </div>` : "";

  const body = `
    ${letterheadHtml(s)}

    <div class="doc-header">
      <div>
        <div class="doc-title">QUOTATION</div>
        <div class="doc-number">${esc(q.number)}</div>
      </div>
      ${statusBadge(q.status)}
    </div>

    <div class="info-grid">
      <div>
        <p class="section-head">Document Details</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="info-block"><label>Title</label><p>${esc(q.title)}</p></div>
          <div class="info-block"><label>Pricing Type</label><p>${pricingLabel[q.pricingType] ?? q.pricingType}</p></div>
          <div class="info-block"><label>Currency</label><p>${q.currency}</p></div>
          <div class="info-block"><label>Created</label><p>${fmtDate(q.createdAt)}</p></div>
          ${q.validUntil ? `<div class="info-block"><label>Valid Until</label><p>${fmtDate(q.validUntil)}</p></div>` : ""}
        </div>
      </div>
      <div>
        ${clientBlock}
      </div>
    </div>

    ${q.description ? `
      <p class="section-head">Scope of Work</p>
      <div class="desc-block">${esc(q.description)}</div>` : ""}

    <p class="section-head">Services &amp; Deliverables</p>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">#</th>
          <th>Item / Description</th>
          <th class="r" style="width:70px;">Type</th>
          <th class="r" style="width:50px;">Qty</th>
          <th class="r" style="width:90px;">Unit Price</th>
          <th class="r" style="width:90px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${lineItemsRows}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">${totalsRows}</div>
    </div>

    ${q.notes ? `
      <div class="note-block">
        <h4>Notes</h4>
        <p>${esc(q.notes)}</p>
      </div>` : ""}

    ${q.terms ? `
      <div class="note-block">
        <h4>Terms &amp; Conditions</h4>
        <pre>${esc(q.terms)}</pre>
      </div>` : ""}

    ${footerHtml(s)}`;

  return wrapHtml(`${q.number} — ${q.title}`, accent, baseStyles(accent), body);
}

/* ─────────────────────────────────────────────────────────────
   CONTRACT template
   ───────────────────────────────────────────────────────────── */
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
  const accent = s.letterheadColor ?? "#6366f1";

  const typeLabel: Record<string, string> = {
    NDA: "Non-Disclosure Agreement",
    SERVICE_AGREEMENT: "Service Agreement",
    EMPLOYMENT: "Employment Agreement",
    FREELANCE: "Freelance Contract",
    PARTNERSHIP: "Partnership Agreement",
    OTHER: "Contract",
  };

  const partyTypeLabel: Record<string, string> = {
    CLIENT: "Client", STAKEHOLDER: "Freelancer / Vendor", USER: "Agency",
  };

  const signedCount = c.parties.filter((p) => p.signedAt).length;
  const totalCount  = c.parties.length;

  const partiesRows = c.parties.map((p) => {
    const signed = !!p.signedAt;
    return `
      <div class="sig-card">
        <div class="name">${esc(p.name)}</div>
        <div class="role">${partyTypeLabel[p.partyType] ?? p.partyType}${p.email ? ` · ${esc(p.email)}` : ""}</div>
        <div class="signed">
          <div class="dot ${signed ? "yes" : "no"}"></div>
          <span style="color:${signed ? "#16a34a" : "#9ca3af"}; font-weight:${signed ? "700" : "400"};">
            ${signed ? "Signed" : "Pending signature"}
          </span>
        </div>
        ${signed && p.signedAt ? `<div class="signed-date">${fmtDate(p.signedAt)}</div>` : ""}
        ${signed && p.signatureNote ? `<div class="sig-note">${esc(p.signatureNote)}</div>` : ""}
        ${!signed ? `<div class="sig-line"></div><div class="sig-label">Signature</div>` : ""}
      </div>`;
  }).join("");

  const progressPct = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;

  const body = `
    ${letterheadHtml(s)}

    <div class="doc-header">
      <div>
        <div class="doc-title">${esc(typeLabel[c.type] ?? "Contract").toUpperCase()}</div>
        <div class="doc-number">${esc(c.title)}</div>
      </div>
      ${statusBadge(c.status)}
    </div>

    <div class="info-grid-3" style="margin-bottom:18px;">
      <div class="info-block"><label>Contract Type</label><p>${esc(typeLabel[c.type] ?? c.type)}</p></div>
      ${c.client ? `<div class="info-block"><label>Client</label><p>${esc(c.client.companyName || c.client.name)}</p></div>` : ""}
      ${c.project ? `<div class="info-block"><label>Project</label><p>${esc(c.project.name)}</p></div>` : ""}
      ${c.startDate ? `<div class="info-block"><label>Effective Date</label><p>${fmtDate(c.startDate)}</p></div>` : ""}
      ${c.endDate   ? `<div class="info-block"><label>Expiry Date</label><p>${fmtDate(c.endDate)}</p></div>` : ""}
      ${c.value != null ? `<div class="info-block"><label>Contract Value</label><p style="font-weight:700;">${fmt(c.value, c.currency)}</p></div>` : ""}
    </div>

    <p class="section-head">Signature Progress (${signedCount} of ${totalCount} signed)</p>
    <div class="progress-wrap" style="margin-bottom:14px;">
      <div class="progress-fill" style="width:${progressPct}%;"></div>
    </div>

    <p class="section-head">Parties</p>
    <div class="sig-grid">${partiesRows}</div>

    ${c.notes ? `
      <div class="note-block">
        <h4>Notes</h4>
        <p>${esc(c.notes)}</p>
      </div>` : ""}

    ${footerHtml(s)}`;

  return wrapHtml(c.title, accent, baseStyles(accent), body);
}

/* ─────────────────────────────────────────────────────────────
   PROJECT template
   ───────────────────────────────────────────────────────────── */
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

  const tasksHtml = statusOrder
    .filter((st) => tasksByStatus[st]?.length)
    .map((st) => {
      const rows = tasksByStatus[st].map((t) => `
        <div class="task-row">
          <div class="task-dot" style="background:${taskDotColor(st)};"></div>
          <div class="task-name">${esc(t.title)}${t.assignee ? `<span style="color:#9ca3af; font-size:8pt;"> · ${esc(t.assignee.name)}</span>` : ""}</div>
          ${t.dueDate ? `<span style="font-size:7.5pt; color:#9ca3af;">${fmtDate(t.dueDate)}</span>` : ""}
        </div>`).join("");
      return `
        <div style="margin-bottom:14px;">
          <div style="font-size:8pt; font-weight:700; color:#374151; margin-bottom:4px;">${statusLabel[st]} (${tasksByStatus[st].length})</div>
          ${rows}
        </div>`;
    }).join("");

  const todoCount = (tasksByStatus["TODO"]?.length ?? 0);
  const inpCount  = (tasksByStatus["IN_PROGRESS"]?.length ?? 0);
  const doneCount = (tasksByStatus["DONE"]?.length ?? 0);
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
    <div class="progress-wrap" style="margin-bottom:18px;">
      <div class="progress-fill" style="width:${p.progress}%;"></div>
    </div>

    ${p.description ? `
      <p class="section-head">Description</p>
      <div class="desc-block">${esc(p.description)}</div>` : ""}

    ${totalTasks > 0 ? `
      <p class="section-head">Tasks (${totalTasks})</p>
      ${tasksHtml}` : ""}

    ${footerHtml(s)}`;

  return wrapHtml(`Project — ${p.name}`, accent, baseStyles(accent), body);
}
