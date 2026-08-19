"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, FileText, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Contract, ContractType, ContractStatus, Project, ClientSummary } from "@/types";

const TYPE_LABELS: Record<ContractType, string> = {
  NDA: "NDA",
  SERVICE_AGREEMENT: "Service Agreement",
  EMPLOYMENT: "Employment",
  FREELANCE: "Freelance",
  PARTNERSHIP: "Partnership",
  OTHER: "Other",
};

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: <FileText className="w-3 h-3" /> },
  SENT: { label: "Sent", color: "bg-blue-50 text-blue-700", icon: <Clock className="w-3 h-3" /> },
  PARTIALLY_SIGNED: { label: "Partial", color: "bg-amber-50 text-amber-700", icon: <AlertCircle className="w-3 h-3" /> },
  FULLY_SIGNED: { label: "Signed", color: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  EXPIRED: { label: "Expired", color: "bg-orange-50 text-orange-700", icon: <XCircle className="w-3 h-3" /> },
  TERMINATED: { label: "Terminated", color: "bg-red-50 text-red-700", icon: <XCircle className="w-3 h-3" /> },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_ORDER: ContractStatus[] = ["DRAFT", "SENT", "PARTIALLY_SIGNED", "FULLY_SIGNED", "EXPIRED", "TERMINATED"];

function ContractsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ContractStatus | "">("");
  const [filterType, setFilterType] = useState<ContractType | "">("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [clients, setClients] = useState<Pick<ClientSummary, "id" | "name" | "companyName">[]>([]);
  const [projects, setProjects] = useState<Pick<Project, "id" | "name">[]>([]);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterStatus) params.set("status", filterStatus);
    if (filterType) params.set("type", filterType);
    const res = await fetch(`/api/contracts?${params}`);
    if (res.ok) setContracts(await res.json());
    setLoading(false);
  }, [search, filterStatus, filterType]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : (d.clients ?? []);
      setClients(list);
    }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      const list: Pick<Project, "id" | "name">[] = Array.isArray(d) ? d : (d.projects ?? []);
      setProjects(list);
    }).catch(() => {});
  }, []);

  const filteredContracts = contracts.filter((c) => {
    if (filterClientId && c.clientId !== filterClientId) return false;
    if (filterProjectId && c.projectId !== filterProjectId) return false;
    return true;
  });

  const byStatus = (status: ContractStatus) => filteredContracts.filter((c) => c.status === status);

  const stats = {
    total: filteredContracts.length,
    signed: filteredContracts.filter((c) => c.status === "FULLY_SIGNED").length,
    pending: filteredContracts.filter((c) => ["SENT", "PARTIALLY_SIGNED"].includes(c.status)).length,
    draft: filteredContracts.filter((c) => c.status === "DRAFT").length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Contracts & NDAs</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage agreements with clients, external parties and your team</p>
          </div>
          <Link href="/contracts/new">
            <Button icon={<Plus className="w-4 h-4" />}>New Contract</Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Total", value: stats.total, color: "text-gray-900" },
            { label: "Fully Signed", value: stats.signed, color: "text-emerald-600" },
            { label: "Awaiting Signatures", value: stats.pending, color: "text-amber-600" },
            { label: "Drafts", value: stats.draft, color: "text-gray-500" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contracts..." type="text"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
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
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as ContractType | "")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Types</option>
            {(Object.entries(TYPE_LABELS) as [ContractType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ContractStatus | "")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">No contracts yet</p>
            <p className="text-xs text-gray-400 mb-5">Create NDAs, service agreements, and freelance contracts</p>
            <Link href="/contracts/new">
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>Create First Contract</Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Type</th>
                  <th className="text-left px-5 py-3">Parties</th>
                  <th className="text-left px-5 py-3">Project / Client</th>
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-center px-5 py-3">Status</th>
                  <th className="text-center px-5 py-3">Signatures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.map((contract) => {
                  const cfg = STATUS_CONFIG[contract.status];
                  const signed = contract.parties.filter((p) => p.signedAt).length;
                  return (
                    <tr key={contract.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/contracts/${contract.id}`)}
                    >
                      <td className="px-5 py-3.5 font-medium text-gray-900">{contract.title}</td>
                      <td className="px-5 py-3.5 text-gray-500">{TYPE_LABELS[contract.type]}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {contract.parties.slice(0, 3).map((p) => (
                            <span key={p.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.name}</span>
                          ))}
                          {contract.parties.length > 3 && (
                            <span className="text-xs text-gray-400">+{contract.parties.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {contract.project?.name ?? contract.client?.name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{formatDate(contract.createdAt)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-xs text-gray-500">
                        {contract.parties.length > 0 ? (
                          <span className={signed === contract.parties.length ? "text-emerald-600 font-medium" : ""}>
                            {signed}/{contract.parties.length}
                          </span>
                        ) : "—"}
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
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" /></div>}>
      <ContractsPageInner />
    </Suspense>
  );
}
