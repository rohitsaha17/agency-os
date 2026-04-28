"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, TrendingDown, RefreshCw, CheckCircle2, Clock, XCircle, Filter, Paperclip, Upload, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useDebounce } from "@/lib/hooks";
import type { Expense, ExpenseCategory, ExpenseStatus, Project, Stakeholder, ClientSummary } from "@/types";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SOFTWARE_TOOLS: "Software & Tools",
  FREELANCER_PAYMENT: "Freelancer Payment",
  VENDOR_PAYMENT: "Vendor Payment",
  STOCK_ASSETS: "Stock Assets",
  PRINTING: "Printing",
  TRAVEL: "Travel",
  ADVERTISING: "Advertising",
  OFFICE: "Office & Overhead",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-red-50 text-red-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const STATUS_ICONS: Record<ExpenseStatus, React.ReactNode> = {
  PENDING: <Clock className="w-3 h-3" />,
  APPROVED: <CheckCircle2 className="w-3 h-3" />,
  REJECTED: <XCircle className="w-3 h-3" />,
  PAID: <CheckCircle2 className="w-3 h-3" />,
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const EMPTY_FORM = {
  title: "", description: "", category: "OTHER" as ExpenseCategory,
  amount: "", currency: "USD", date: new Date().toISOString().slice(0, 10),
  status: "PENDING" as ExpenseStatus, projectId: "", stakeholderId: "", userId: "",
  isReimbursable: false, receiptUrl: "", notes: "",
};

export default function ExpensesPage() {
  const toast   = useToast();
  const confirm = useConfirm();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<Pick<Project, "id" | "name">[]>([]);
  const [allProjectsFull, setAllProjectsFull] = useState<(Pick<Project, "id" | "name"> & { clientId?: string })[]>([]);
  const [clients, setClients] = useState<Pick<ClientSummary, "id" | "name" | "companyName">[]>([]);
  const [stakeholders, setStakeholders] = useState<Pick<Stakeholder, "id" | "name" | "type">[]>([]);

  // Receipt OCR state
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<{
    vendor?: string; amount?: number; currency?: string; date?: string;
    category?: ExpenseCategory; lineItems?: { description: string; amount: number }[];
    notes?: string; confidence?: string;
  } | null>(null);
  const [ocrVerified, setOcrVerified] = useState(false);

  const handleReceiptOCR = async (file: File) => {
    setOcrScanning(true);
    setOcrResult(null);
    setOcrVerified(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/receipt-ocr", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setOcrResult(data);
        // Pre-fill form but DON'T auto-accept — user must verify
        setForm((prev) => ({
          ...prev,
          title: data.vendor ? `${data.vendor}` : prev.title,
          amount: data.amount ? String(data.amount) : prev.amount,
          currency: data.currency || prev.currency,
          date: data.date || prev.date,
          category: data.category || prev.category,
          notes: data.notes || prev.notes,
        }));
      } else {
        toast.error("Failed to scan receipt. Please fill in details manually.");
      }
    } catch {
      toast.error("Receipt scan failed. Please fill in details manually.");
    } finally {
      setOcrScanning(false);
    }
  };

  const debouncedSearch = useDebounce(search, 300);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterCategory) params.set("category", filterCategory);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/expenses?${params}`);
    if (res.ok) setExpenses(await res.json());
    setLoading(false);
  }, [debouncedSearch, filterCategory, filterStatus]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // Fetch projects and clients on mount for filter dropdowns
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      const list: (Pick<Project, "id" | "name"> & { clientId?: string })[] = Array.isArray(d.projects) ? d.projects : Array.isArray(d) ? d : [];
      setProjects(list);
      setAllProjectsFull(list);
    }).catch(() => {});
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : (d.clients ?? []);
      setClients(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (addOpen) {
      fetch("/api/stakeholders").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setStakeholders(d); });
    }
  }, [addOpen]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    let receiptUrl = form.receiptUrl;
    // Upload receipt file if selected. On failure, clear the staged file,
    // surface a toast, and abort so the user can retry/fix rather than
    // silently saving an expense with no receipt attached.
    if (receiptFile) {
      const fd = new FormData();
      fd.append("file", receiptFile);
      try {
        const uploadRes = await fetch("/api/files", { method: "POST", body: fd });
        if (uploadRes.ok) {
          const uploaded = await uploadRes.json();
          receiptUrl = uploaded.url || uploaded.fileUrl || "";
        } else {
          setReceiptFile(null);
          toast.error("Receipt upload failed. Please try again.");
          setSaving(false);
          return;
        }
      } catch {
        setReceiptFile(null);
        toast.error("Receipt upload failed. Please try again.");
        setSaving(false);
        return;
      }
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, receiptUrl }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Expense added");
      setAddOpen(false); setForm(EMPTY_FORM); setReceiptFile(null); fetchExpenses();
    } else {
      toast.error("Failed to add expense");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete expense?",
      message: "This expense record will be permanently removed.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    toast.success("Expense deleted");
    fetchExpenses();
  };

  const handleStatusChange = async (id: string, status: ExpenseStatus) => {
    const res = await fetch(`/api/expenses/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchExpenses();
    else toast.error("Failed to update status");
  };

  // Build a projectId → clientId lookup from the full projects list
  const projectClientMap = new Map(
    allProjectsFull.filter((p) => p.clientId).map((p) => [p.id, p.clientId!])
  );

  const filteredExpenses = expenses.filter((e) => {
    if (filterProjectId && e.projectId !== filterProjectId) return false;
    if (filterClientId) {
      const expClientId = e.projectId ? projectClientMap.get(e.projectId) : undefined;
      if (expClientId !== filterClientId) return false;
    }
    return true;
  });

  const totalPaid = filteredExpenses.filter((e) => e.status === "PAID").reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = filteredExpenses.filter((e) => e.status === "PENDING").reduce((s, e) => s + Number(e.amount), 0);
  const reimbursable = filteredExpenses.filter((e) => e.isReimbursable && e.status !== "REJECTED").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track all outgoing costs across projects</p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>New Expense</Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Total Expenses", value: filteredExpenses.length, sub: "records", icon: <TrendingDown className="w-4 h-4 text-gray-400" /> },
            { label: "Paid", value: formatCurrency(totalPaid, "USD"), sub: "settled", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
            { label: "Pending", value: formatCurrency(totalPending, "USD"), sub: "awaiting approval", icon: <Clock className="w-4 h-4 text-amber-400" /> },
            { label: "Reimbursable", value: formatCurrency(reimbursable, "USD"), sub: "to bill to client", icon: <RefreshCw className="w-4 h-4 text-indigo-400" /> },
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
              placeholder="Search expenses..." type="text"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>
          <select
            value={filterClientId}
            onChange={(e) => { setFilterClientId(e.target.value); setFilterProjectId(""); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName ? `${c.companyName} (${c.name})` : c.name}
              </option>
            ))}
          </select>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Projects</option>
            {allProjectsFull
              .filter((p) => !filterClientId || p.clientId === filterClientId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
          <select
            value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {(Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {(["PENDING", "APPROVED", "PAID", "REJECTED"] as ExpenseStatus[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {(filterCategory || filterStatus || search || filterProjectId || filterClientId) && (
            <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterStatus(""); setFilterProjectId(""); setFilterClientId(""); }} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <TrendingDown className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {filterProjectId || filterClientId || filterCategory || filterStatus || search ? "No expenses match your filters" : "No expenses yet"}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {filterProjectId || filterClientId || filterCategory || filterStatus || search ? "Try adjusting your filters" : "Track costs for projects, tools, freelancers, and more"}
            </p>
            {!filterProjectId && !filterClientId && !filterCategory && !filterStatus && !search && (
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add First Expense</Button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-left px-5 py-3">Project / Stakeholder</th>
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-right px-5 py-3">Amount</th>
                  <th className="text-center px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{exp.title}</p>
                      {exp.isReimbursable && (
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">Reimbursable</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{CATEGORY_LABELS[exp.category]}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {exp.project && <Link href={`/projects/${exp.project.id}`} className="text-indigo-600 hover:underline">{exp.project.name}</Link>}
                      {exp.stakeholder && <p className="text-xs text-gray-400">{exp.stakeholder.name}</p>}
                      {!exp.project && !exp.stakeholder && <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(exp.date)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(Number(exp.amount), exp.currency)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="relative inline-block">
                        <select
                          value={exp.status}
                          onChange={(e) => handleStatusChange(exp.id, e.target.value as ExpenseStatus)}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${STATUS_COLORS[exp.status]}`}
                        >
                          {(["PENDING", "APPROVED", "PAID", "REJECTED"] as ExpenseStatus[]).map((s) => (
                            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(exp.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-all"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {addOpen && (
        <Modal open={addOpen} title="New Expense" onClose={() => setAddOpen(false)} width="max-w-lg">
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} required
                placeholder="e.g. Stock photos for homepage"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount *</label>
                <input value={form.amount} onChange={(e) => set("amount", e.target.value)} required type="number" step="0.01"
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                <select value={form.currency} onChange={(e) => set("currency", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select value={form.category} onChange={(e) => set("category", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
                <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Stakeholder</label>
                <select value={form.stakeholderId} onChange={(e) => set("stakeholderId", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {stakeholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
                placeholder="Optional notes..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Receipt / Attachment</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-gray-600">
                  <Upload className="w-3.5 h-3.5" />
                  {receiptFile ? receiptFile.name : "Upload receipt"}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setReceiptFile(f);
                      if (f && f.type.startsWith("image/")) {
                        handleReceiptOCR(f);
                      }
                    }}
                  />
                </label>
                {receiptFile && (
                  <button type="button" onClick={() => { setReceiptFile(null); setOcrResult(null); setOcrVerified(false); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              {ocrScanning && (
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scanning receipt with AI...
                </div>
              )}
              {ocrResult && !ocrVerified && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-900">AI extracted the following — please verify before saving</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Confidence: <span className="font-medium">{ocrResult.confidence || "medium"}</span> — Always double-check amounts and dates
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-amber-800 pl-6">
                    {ocrResult.vendor && <p>Vendor: <span className="font-medium">{ocrResult.vendor}</span></p>}
                    {ocrResult.amount && <p>Amount: <span className="font-medium">{ocrResult.currency || "USD"} {ocrResult.amount}</span></p>}
                    {ocrResult.date && <p>Date: <span className="font-medium">{ocrResult.date}</span></p>}
                    {ocrResult.category && <p>Category: <span className="font-medium">{CATEGORY_LABELS[ocrResult.category] || ocrResult.category}</span></p>}
                    {ocrResult.lineItems && ocrResult.lineItems.length > 0 && (
                      <div className="mt-1">
                        <p className="font-medium mb-0.5">Line items:</p>
                        {ocrResult.lineItems.map((item, i) => (
                          <p key={i} className="pl-2">- {item.description}: {ocrResult.currency || "USD"} {item.amount}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        // Revalidate required fields before marking verified so
                        // the submit button truly reflects a ready-to-save form.
                        const missing: string[] = [];
                        if (!form.title.trim()) missing.push("title");
                        if (!form.amount || Number(form.amount) <= 0) missing.push("amount");
                        if (!form.date) missing.push("date");
                        if (missing.length) {
                          toast.error(`Please fill in required fields: ${missing.join(", ")}`);
                          return;
                        }
                        setOcrVerified(true);
                        toast.success("OCR data verified — form fields updated");
                      }}
                      className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                    >
                      Looks correct
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOcrResult(null); }}
                      className="text-xs px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      Ignore & fill manually
                    </button>
                  </div>
                </div>
              )}
              {ocrVerified && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" /> AI-extracted data verified — review fields above
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="reimb" checked={form.isReimbursable}
                onChange={(e) => set("isReimbursable", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="reimb" className="text-sm text-gray-700">Reimbursable (bill to client)</label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>Add Expense</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
