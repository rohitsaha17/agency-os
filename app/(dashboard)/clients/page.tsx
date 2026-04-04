"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Plus, Users, TrendingUp, UserCheck } from "lucide-react";
import { ClientCard } from "@/components/clients/ClientCard";
import { Button } from "@/components/ui/Button";
import { ClientSummary, ClientStatus } from "@/types";

const STATUS_FILTERS: { label: string; value: ClientStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Prospects", value: "PROSPECT" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
];

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "ALL">("ALL");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load clients");
      setClients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchClients, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchClients, search]);

  const counts = {
    total: clients.length,
    active: clients.filter((c) => c.status === "ACTIVE").length,
    prospects: clients.filter((c) => c.status === "PROSPECT").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage your agency's client relationships
            </p>
          </div>
          <Link href="/clients/new">
            <Button icon={<Plus className="w-4 h-4" />}>New Client</Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Clients", value: counts.total, icon: Users, color: "text-indigo-600 bg-indigo-50" },
            { label: "Active", value: counts.active, icon: TrendingUp, color: "text-green-600 bg-green-50" },
            { label: "Prospects", value: counts.prospects, icon: UserCheck, color: "text-blue-600 bg-blue-50" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto flex-shrink-0">
            {STATUS_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === value
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded" />
                  <div className="h-3 bg-gray-200 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-red-800">Failed to load clients</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={() => fetchClients()}
              className="mt-3 text-xs text-red-700 underline hover:text-red-900"
            >
              Try again
            </button>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {search || statusFilter !== "ALL" ? "No clients match your filters" : "No clients yet"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {search || statusFilter !== "ALL"
                ? "Try adjusting your search or filter"
                : "Get started by adding your first client"}
            </p>
            {!search && statusFilter === "ALL" && (
              <Link href="/clients/new" className="mt-4">
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
                  Add First Client
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
