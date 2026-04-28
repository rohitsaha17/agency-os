"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, FileText, ChevronRight,
  Clock, CheckCircle2, XCircle, Send, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";
import type { Quotation, QuotationStatus } from "@/types";

// ── Status config ─────────────────────────────────────────────

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:     { label: "Draft",     color: "bg-gray-100 text-gray-600",       icon: <FileText className="w-3 h-3" /> },
  SENT:      { label: "Sent",      color: "bg-blue-50 text-blue-700",         icon: <Send className="w-3 h-3" /> },
  APPROVED:  { label: "Approved",  color: "bg-emerald-50 text-emerald-700",   icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED:  { label: "Rejected",  color: "bg-red-50 text-red-600",           icon: <XCircle className="w-3 h-3" /> },
  EXPIRED:   { label: "Expired",   color: "bg-yellow-50 text-yellow-700",     icon: <Clock className="w-3 h-3" /> },
  CONVERTED: { label: "Converted", color: "bg-indigo-50 text-indigo-700",     icon: <RefreshCw className="w-3 h-3" /> },
};

type QuotationSummary = Quotation & {
  client: { id: string; name: string; companyName: string | null; logoUrl: string | null };
  _count: { lineItems: number };
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "ALL">("ALL");

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quotations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuotations(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  const filtered = quotations.filter((q) => {
    if (statusFilter !== "ALL" && q.status !== statusFilter) return false;
    if (search && !q.title.toLowerCase().includes(search.toLowerCase()) &&
        !q.client?.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:    quotations.length,
    draft:    quotations.filter((q) => q.status === "DRAFT").length,
    sent:     quotations.filter((q) => q.status === "SENT").length,
    approved: quotations.filter((q) => q.status === "APPROVED").length,
    value:    quotations.filter((q) => q.status === "APPROVED").reduce((s, q) => s + Number(q.total), 0),
  };

  const STATUS_TABS: (QuotationStatus | "ALL")[] = ["ALL", "DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Quotations</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create and manage client proposals</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/rate-cards">
              <Button variant="secondary" size="sm">Rate Cards</Button>
            </Link>
            <Link href="/quotations/new">
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>New Quotation</Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          {[
            { label: "Total",    value: stats.total,    color: "text-gray-900" },
            { label: "Draft",    value: stats.draft,    color: "text-gray-600" },
            { label: "Sent",     value: stats.sent,     color: "text-blue-700" },
            { label: "Approved value", value: `${stats.value > 0 ? formatMoney(stats.value, "USD") : stats.approved + " approved"}`, color: "text-emerald-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto space-y-5">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="Search quotations or clients…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 flex-wrap overflow-x-auto">
            {STATUS_TABS.map((s) => (
              <button
                key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-amber-800">Database not connected</p>
            <p className="text-xs text-amber-600 mt-1">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {search || statusFilter !== "ALL" ? "No quotations match" : "No quotations yet"}
            </p>
            {!search && statusFilter === "ALL" && (
              <Link href="/quotations/new" className="mt-3 text-sm text-indigo-600 hover:underline">
                Create your first quotation
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
            {/* Table header */}
            <div className="grid px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide"
              style={{ gridTemplateColumns: "1fr 1fr 6rem 6rem 6rem 7rem 2rem", minWidth: "600px" }}>
              <span>Title</span>
              <span>Client</span>
              <span>Status</span>
              <span>Items</span>
              <span>Valid Until</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {/* Rows */}
            <div>
            {filtered.map((q) => {
              const cfg = STATUS_CONFIG[q.status];
              return (
                <Link
                  key={q.id}
                  href={`/quotations/${q.id}`}
                  className="grid px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors items-center"
                  style={{ gridTemplateColumns: "1fr 1fr 6rem 6rem 6rem 7rem 2rem", minWidth: "600px" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.number}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">{q.client?.name}</p>
                    {q.client?.companyName && (
                      <p className="text-xs text-gray-400 truncate">{q.client.companyName}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium w-fit ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-sm text-gray-600">{q._count?.lineItems ?? 0} items</span>
                  <span className="text-sm text-gray-500">{formatDate(q.validUntil)}</span>
                  <span className="text-sm font-semibold text-gray-900 text-right">
                    {formatMoney(Number(q.total), q.currency)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              );
            })}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
