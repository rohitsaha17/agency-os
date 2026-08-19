"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, Receipt, CheckCircle2, Clock, XCircle,
  Send, CreditCard, Download, Trash2, Filter, Eye,
  FileText, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useDebounce } from "@/lib/hooks";
import { calcInvoiceTotal } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { Invoice, InvoiceStatus, ClientSummary, Project } from "@/types";

// ── Constants ─────────────────────────────────────────────────

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:     { label: "Draft",     color: "bg-gray-100 text-gray-600",       icon: <FileText className="w-3 h-3" /> },
  SENT:      { label: "Sent",      color: "bg-blue-50 text-blue-700",        icon: <Send className="w-3 h-3" /> },
  PAID:      { label: "Paid",      color: "bg-emerald-50 text-emerald-700",  icon: <CheckCircle2 className="w-3 h-3" /> },
  OVERDUE:   { label: "Overdue",   color: "bg-red-50 text-red-700",          icon: <Clock className="w-3 h-3" /> },
  CANCELLED: { label: "Cancelled", color: "bg-gray-100 text-gray-400",       icon: <XCircle className="w-3 h-3" /> },
};

const STATUS_ORDER: InvoiceStatus[] = ["DRAFT", "SENT", "OVERDUE", "PAID", "CANCELLED"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Single source of truth for invoice totals — shared with the create modal.
function calcTotal(inv: Invoice) {
  return calcInvoiceTotal(
    inv.lineItems.map((li) => ({ quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) })),
    { discountRate: inv.discountPct ?? 0, taxRate: inv.taxPct ?? 0 },
  ).total;
}

// ── Empty state ────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
        <Receipt className="w-7 h-7 text-indigo-500" />
      </div>
      <p className="text-base font-semibold text-gray-800 mb-1">No invoices yet</p>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        Create an invoice from scratch, or generate one from a client's package month.
      </p>
      <Button icon={<Plus className="w-4 h-4" />} onClick={onNew}>Create First Invoice</Button>
    </div>
  );
}

// ── Create/Edit modal ──────────────────────────────────────────

interface LineItemDraft {
  description: string; quantity: string; unitPrice: string; unit: string;
  // v2 (Phase 7): package/extra billing
  kind?: "PACKAGE" | "EXTRA" | "CUSTOM";
  contentItemId?: string | null;
  /** EXTRA lines: include (bill), exclude (drop, claimable later), free (0, complimentary) */
  mode?: "include" | "exclude" | "free";
}

const EMPTY_LINE: LineItemDraft = { description: "", quantity: "1", unitPrice: "0", unit: "", kind: "CUSTOM", mode: "include" };

function InvoiceFormModal({
  open, onClose, onCreated, clients, projects,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  clients: Pick<ClientSummary, "id" | "name" | "companyName">[];
  projects: Pick<Project, "id" | "name">[];
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId: "", projectId: "",
    dueDate: "", currency: "USD",
    discountPct: "", taxPct: "", notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([{ ...EMPTY_LINE }]);
  // v2 Phase 7: generate from a client's package month
  const [fromMonth, setFromMonth] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().toISOString().slice(0, 7));
  const [genLoading, setGenLoading] = useState(false);
  const [genInfo, setGenInfo] = useState<string | null>(null);

  const generateFromMonth = async (clientId: string, month: string) => {
    if (!clientId || !month) return;
    setGenLoading(true);
    setGenInfo(null);
    try {
      const res = await fetch(`/api/invoices/generate-from-month?clientId=${clientId}&month=${month}`);
      const d = await res.json();
      if (!res.ok) { setGenInfo(d.error?.message ?? "Failed to generate"); return; }
      if (d.lines.length === 0) {
        setGenInfo("No package or unbilled extras found for that month.");
        setLineItems([{ ...EMPTY_LINE }]);
        return;
      }
      setLineItems(d.lines.map((l: { kind: "PACKAGE" | "EXTRA"; description: string; quantity: number; unitPrice: number; contentItemId: string | null }) => ({
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        unit: "",
        kind: l.kind,
        contentItemId: l.contentItemId,
        mode: "include" as const,
      })));
      setField("currency", d.currency);
      setGenInfo(d.packageFound ? null : "No active package for that month — extras only.");
    } finally {
      setGenLoading(false);
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addLine    = () => setLineItems((l) => [...l, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLineItems((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, k: keyof LineItemDraft, v: string) =>
    setLineItems((l) => l.map((li, idx) => idx === i ? { ...li, [k]: v } : li));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId) { toast.error("Client is required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, lineItems: lineItems
            .filter((li) => li.mode !== "exclude")
            .map((li, i) => ({
              description: li.description, quantity: parseFloat(li.quantity) || 1,
              unitPrice: li.mode === "free" ? 0 : parseFloat(li.unitPrice) || 0,
              unit: li.unit || null, order: i,
              kind: li.kind ?? "CUSTOM",
              isFree: li.mode === "free",
              contentItemId: li.contentItemId ?? null,
            }))
        };
      const res = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast.success("Invoice created", `${data.invoiceNumber} is ready`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error("Failed to create invoice", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const {
    subtotal,
    discount: disc,
    tax,
    total,
  } = calcInvoiceTotal(
    lineItems
      .filter((li) => li.mode !== "exclude")
      .map((li) => ({ quantity: li.quantity, unitPrice: li.unitPrice, isFree: li.mode === "free" })),
    { discountRate: form.discountPct, taxRate: form.taxPct },
  );

  return (
    <Modal open={open} onClose={onClose} title="New Invoice" width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Client + Project */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client *</label>
            <select value={form.clientId} onChange={(e) => setField("clientId", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} (${c.name})` : c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select value={form.projectId} onChange={(e) => setField("projectId", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* v2 Phase 7: generate from package month */}
        {form.clientId && (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="fromMonth" checked={fromMonth}
                onChange={(e) => {
                  setFromMonth(e.target.checked);
                  if (e.target.checked) {
                    generateFromMonth(form.clientId, genMonth);
                  } else {
                    setLineItems([{ ...EMPTY_LINE }]);
                    setGenInfo(null);
                  }
                }}
                className="w-4 h-4 text-emerald-600 rounded" />
              <label htmlFor="fromMonth" className="text-sm text-emerald-800 font-medium">
                Generate from month (package + extras)
              </label>
              {fromMonth && (
                <input type="month" value={genMonth}
                  onChange={(e) => { setGenMonth(e.target.value); generateFromMonth(form.clientId, e.target.value); }}
                  className="ml-auto px-2 py-1 text-xs border border-emerald-200 rounded-lg bg-white" />
              )}
            </div>
            {genLoading && <p className="text-xs text-emerald-600">Loading month…</p>}
            {genInfo && <p className="text-xs text-amber-600">{genInfo}</p>}
          </div>
        )}

        {/* Line items */}
        {(
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Line Items</label>
              <button type="button" onClick={addLine}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className={`space-y-1 ${li.mode === "exclude" ? "opacity-40" : ""}`}>
                  <div className="flex gap-2 items-start">
                    {li.kind === "PACKAGE" && (
                      <span className="mt-1.5 text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">PKG</span>
                    )}
                    {li.kind === "EXTRA" && (
                      <span className="mt-1.5 text-[9px] font-bold px-1.5 py-0.5 bg-fuchsia-100 text-fuchsia-700 rounded-full flex-shrink-0">EXTRA</span>
                    )}
                    <input value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input value={li.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)}
                      type="number" step="0.01" min="0" placeholder="Qty"
                      className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                    />
                    <input value={li.mode === "free" ? "0" : li.unitPrice}
                      onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                      disabled={li.mode === "free"}
                      type="number" step="0.01" min="0" placeholder="Price"
                      className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                    />
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        className="mt-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* v2: Include | Exclude | Free for extras */}
                  {li.kind === "EXTRA" && (
                    <div className="flex items-center gap-2 pl-10">
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px]">
                        {(["include", "exclude", "free"] as const).map((m) => (
                          <button key={m} type="button"
                            onClick={() => setLineItems((l) => l.map((x, idx) => idx === i ? { ...x, mode: m } : x))}
                            className={`px-2 py-0.5 font-medium capitalize ${
                              (li.mode ?? "include") === m
                                ? m === "free" ? "bg-emerald-50 text-emerald-700"
                                : m === "exclude" ? "bg-gray-100 text-gray-500"
                                : "bg-indigo-50 text-indigo-700"
                                : "text-gray-400 hover:text-gray-600"
                            }`}>
                            {m}
                          </button>
                        ))}
                      </div>
                      {li.mode === "free" && (
                        <span className="text-[10px] font-medium text-emerald-600">Complimentary — excluded from totals</span>
                      )}
                      {li.mode === "exclude" && (
                        <span className="text-[10px] text-gray-400">Dropped — stays claimable next time</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Due date + currency */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Discount %</label>
            <input type="number" step="0.1" min="0" max="100" value={form.discountPct}
              onChange={(e) => setField("discountPct", e.target.value)} placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tax %</label>
            <input type="number" step="0.1" min="0" max="100" value={form.taxPct}
              onChange={(e) => setField("taxPct", e.target.value)} placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
          <select value={form.currency} onChange={(e) => setField("currency", e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        {(
          <div className="text-right text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3 space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">{formatMoney(subtotal, form.currency || "USD")}</span></div>
            {disc > 0 && <div className="flex justify-between text-red-600"><span>Discount ({form.discountPct}%)</span><span>−{formatMoney(disc, form.currency)}</span></div>}
            {tax > 0  && <div className="flex justify-between"><span>Tax ({form.taxPct}%)</span><span>{formatMoney(tax, form.currency)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1 mt-1">
              <span>Total</span><span>{formatMoney(total, form.currency)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2}
            placeholder="Payment terms, bank details, notes for the client…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create Invoice</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────

export default function InvoicesPage() {
  const toast   = useToast();
  const confirm = useConfirm();
  const { user: currentUser } = useCurrentUser();

  const [invoices,      setInvoices]      = useState<Invoice[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<InvoiceStatus | "">("");
  const [filterClient,  setFilterClient]  = useState("");
  const [addOpen,       setAddOpen]       = useState(false);
  const [clients,       setClients]       = useState<Pick<ClientSummary, "id" | "name" | "companyName">[]>([]);
  const [projects,      setProjects]      = useState<Pick<Project, "id" | "name">[]>([]);
  const [pdfLoading,    setPdfLoading]    = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterStatus)    params.set("status", filterStatus);
    if (filterClient)    params.set("clientId", filterClient);
    const res = await fetch(`/api/invoices?${params}`);
    if (res.ok) setInvoices(await res.json());
    setLoading(false);
  }, [debouncedSearch, filterStatus, filterClient]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => setClients(Array.isArray(d) ? d : d.clients ?? []));
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(Array.isArray(d) ? d : d.projects ?? []));
  }, []);

  const handleStatusChange = async (id: string, status: InvoiceStatus) => {
    const inv = invoices.find((i) => i.id === id);

    // Confirm irreversible transitions.
    if (status === "SENT" && inv?.status !== "SENT") {
      const ok = await confirm({
        title: "Send invoice?",
        message: "This will mark the invoice as sent to the client.",
        confirmLabel: "Mark as Sent",
        variant: "info",
      });
      if (!ok) return;
    }

    let paidAtIso: string | undefined;
    if (status === "PAID" && inv?.status !== "PAID") {
      // Require an explicit paid date — prevents silently stamping "today"
      // when jumping from DRAFT directly to PAID.
      const defaultDate = new Date().toISOString().slice(0, 10);
      const entered = typeof window !== "undefined"
        ? window.prompt(
            `Mark ${inv?.invoiceNumber ?? "invoice"} as paid.\nEnter payment date (YYYY-MM-DD):`,
            defaultDate,
          )
        : null;
      if (!entered) return;
      const parsed = new Date(entered);
      if (isNaN(parsed.getTime())) {
        toast.error("Invalid date", "Please enter a date in YYYY-MM-DD format");
        return;
      }
      paidAtIso = parsed.toISOString();
    }

    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(paidAtIso ? { paidAt: paidAtIso } : {}) }),
    });
    if (res.ok) {
      toast.success("Status updated");
      fetchInvoices();
    } else {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (inv: Invoice) => {
    const ok = await confirm({
      title: "Delete invoice?",
      message: `${inv.invoiceNumber} will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete Invoice",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Invoice deleted"); fetchInvoices(); }
    else toast.error("Failed to delete invoice");
  };

  const handleDownloadPdf = async (inv: Invoice) => {
    setPdfLoading(inv.id);
    try {
      const [{ fetchSettings, openPrintPdf }, { buildInvoiceHtml }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdfTemplates"),
      ]);
      const settings = await fetchSettings();
      const html = buildInvoiceHtml({ ...inv, client: inv.client ?? null, project: inv.project ?? null }, settings);
      await openPrintPdf(html);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(null);
    }
  };

  // Stats
  const isInvOverdue = (i: Invoice) =>
    i.status === "OVERDUE" ||
    (i.status === "SENT" && !!i.dueDate && new Date(i.dueDate) < new Date());
  // Org-wide aggregates use the organization currency (not first-row guess).
  const displayCurrency = currentUser?.organization?.currency ?? invoices[0]?.currency ?? "USD";
  const totalRevenue = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + calcTotal(i), 0);
  const outstanding  = invoices.filter((i) => ["DRAFT", "SENT", "OVERDUE"].includes(i.status)).reduce((s, i) => s + calcTotal(i), 0);
  const overdue      = invoices.filter(isInvOverdue).length;

  const hasFilters = !!filterStatus || !!search || !!filterClient;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage billing and payment collection</p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>New Invoice</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Total Invoices",  value: invoices.length,              sub: "records",         icon: <Receipt className="w-4 h-4 text-gray-400" /> },
            { label: "Collected",       value: formatMoney(totalRevenue, displayCurrency), sub: "paid",      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
            { label: "Outstanding",     value: formatMoney(outstanding, displayCurrency),  sub: "pending",   icon: <CreditCard className="w-4 h-4 text-indigo-400" /> },
            { label: "Overdue",         value: overdue,                       sub: "need attention",  icon: <Clock className="w-4 h-4 text-red-400" /> },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
              <p className="text-lg font-semibold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number…" type="text"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
            />
          </div>
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName ?? c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | "")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterClient(""); }}
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              <Filter className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-48" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm font-medium text-gray-600 mb-1">No invoices match your filters</p>
              <p className="text-xs text-gray-400 mb-4">Try adjusting or clearing your filters</p>
              <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterClient(""); }}
                className="text-sm text-indigo-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <EmptyState onNew={() => setAddOpen(true)} />
          )
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Invoice</th>
                    <th className="text-left px-5 py-3">Client</th>
                    <th className="text-left px-5 py-3">Project</th>
                    <th className="text-left px-5 py-3">Due Date</th>
                    <th className="text-right px-5 py-3">Amount</th>
                    <th className="text-center px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const cfg = STATUS_CONFIG[inv.status];
                    const total = calcTotal(inv);
                    const isOverdue = inv.status === "SENT" && inv.dueDate && new Date(inv.dueDate) < new Date();
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-gray-900 font-mono text-xs">{inv.invoiceNumber}</p>
                          {inv.lineItems.length > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">
                              {inv.lineItems[0].description}
                              {inv.lineItems.length > 1 ? ` +${inv.lineItems.length - 1} more` : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {inv.client ? (
                            <Link href={`/clients/${inv.client.id}`} className="text-indigo-600 hover:underline text-sm">
                              {inv.client.companyName ?? inv.client.name}
                            </Link>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-sm">
                          {inv.project ? (
                            <Link href={`/projects/${inv.project.id}`} className="hover:text-indigo-600 transition-colors">
                              {inv.project.name}
                            </Link>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-5 py-3.5 whitespace-nowrap text-sm ${isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                          {formatDate(inv.dueDate)}
                          {isOverdue && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-gray-900 tabular-nums">
                          {formatMoney(total, inv.currency)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <select
                            value={inv.status}
                            onChange={(e) => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${cfg.color}`}
                          >
                            {STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {inv.status !== "PAID" && (
                              <button
                                onClick={() => handleStatusChange(inv.id, "PAID")}
                                className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors flex items-center gap-1"
                                title="Mark as Paid"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </button>
                            )}
                            <button
                              onClick={() => handleDownloadPdf(inv)}
                              disabled={pdfLoading === inv.id}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(inv)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete invoice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <InvoiceFormModal
        open={addOpen} onClose={() => setAddOpen(false)}
        onCreated={fetchInvoices} clients={clients} projects={projects}
      />
    </div>
  );
}
