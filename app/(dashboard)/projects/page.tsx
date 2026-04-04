"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Plus, FolderKanban, CheckSquare, RefreshCw } from "lucide-react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Button } from "@/components/ui/Button";
import type { Project, ProjectStatus, ProjectType, ClientSummary } from "@/types";

const STATUS_FILTERS: { label: string; value: ProjectStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "On Hold", value: "ON_HOLD" },
  { label: "Completed", value: "COMPLETED" },
];

const TYPE_FILTERS: { label: string; value: ProjectType | "ALL" }[] = [
  { label: "All Types", value: "ALL" },
  { label: "One-Time", value: "ONE_TIME" },
  { label: "Retainer", value: "RETAINER" },
];

type ProjectWithProgress = Project & { progress: number };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "ALL">("ALL");
  const [filterClientId, setFilterClientId] = useState("");
  const [clients, setClients] = useState<Pick<ClientSummary, "id" | "name" | "companyName">[]>([]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      const res = await fetch(`/api/projects?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");
      setProjects(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    const t = setTimeout(fetchProjects, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchProjects, search]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.clients ?? []);
        setClients(list);
      })
      .catch(() => {});
  }, []);

  const filteredProjects = filterClientId
    ? projects.filter((p) => p.clientId === filterClientId)
    : projects;

  const counts = {
    total: filteredProjects.length,
    active: filteredProjects.filter((p) => p.status === "ACTIVE").length,
    retainers: filteredProjects.filter((p) => p.type === "RETAINER").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track all your agency work in one place</p>
          </div>
          <Link href="/projects/new">
            <Button icon={<Plus className="w-4 h-4" />}>New Project</Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Projects", value: counts.total, icon: FolderKanban, color: "text-indigo-600 bg-indigo-50" },
            { label: "Active", value: counts.active, icon: CheckSquare, color: "text-green-600 bg-green-50" },
            { label: "Retainers", value: counts.retainers, icon: RefreshCw, color: "text-purple-600 bg-purple-50" },
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
        <div className="space-y-3">
          {/* Row 1: search + client dropdown */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName ? `${c.companyName}` : c.name}
                </option>
              ))}
            </select>
          </div>
          {/* Row 2: status + type filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === value
                      ? "bg-indigo-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {TYPE_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    typeFilter === value
                      ? "bg-indigo-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                <div className="h-1.5 bg-gray-200 rounded-full mt-4 mb-3" />
                <div className="flex justify-between">
                  <div className="h-5 bg-gray-200 rounded-full w-16" />
                  <div className="h-3 bg-gray-200 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-red-800">Failed to load projects</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={() => fetchProjects()}
              className="mt-3 text-xs text-red-700 underline hover:text-red-900"
            >
              Try again
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <FolderKanban className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {search || statusFilter !== "ALL" || typeFilter !== "ALL" || filterClientId
                ? "No projects match your filters"
                : "No projects yet"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {search || statusFilter !== "ALL" || typeFilter !== "ALL" || filterClientId
                ? "Try adjusting your search or filters"
                : "Create your first project to start tracking work"}
            </p>
            {!search && statusFilter === "ALL" && typeFilter === "ALL" && !filterClientId && (
              <Link href="/projects/new" className="mt-4">
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
                  New Project
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
