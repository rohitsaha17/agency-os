"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload,
  Grid3X3,
  List,
  Search,
  Folder,
  HardDrive,
  Image,
  Video,
  FileText,
  File as FileIcon,
  AlertTriangle,
} from "lucide-react";
import type { AssetFile, FileStatus, MimeCategory, Project, ClientSummary } from "@/types";
import { FileCard } from "@/components/files/FileCard";
import { FileUploadZone } from "@/components/files/FileUploadZone";
import { FileReviewModal } from "@/components/files/FileReviewModal";

// ── types ──────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

interface Stats {
  total: number;
  images: number;
  videos: number;
  inReview: number;
  approved: number;
}

// ── status tabs ────────────────────────────────────────────────

const STATUS_TABS: { label: string; value: FileStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "In Review", value: "IN_REVIEW" },
  { label: "Approved", value: "APPROVED" },
  { label: "Changes Required", value: "CHANGES_REQUIRED" },
];

// ── category tabs ──────────────────────────────────────────────

const CATEGORY_TABS: {
  label: string;
  value: MimeCategory | "";
  icon: React.ReactNode;
}[] = [
  { label: "All", value: "", icon: <HardDrive className="w-3.5 h-3.5" /> },
  { label: "Images", value: "image", icon: <Image className="w-3.5 h-3.5" /> },
  { label: "Videos", value: "video", icon: <Video className="w-3.5 h-3.5" /> },
  { label: "PDFs", value: "pdf", icon: <FileText className="w-3.5 h-3.5" /> },
  { label: "Docs", value: "doc", icon: <FileIcon className="w-3.5 h-3.5" /> },
  { label: "Other", value: "other", icon: <FileIcon className="w-3.5 h-3.5" /> },
];

// ── skeleton ───────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-slate-800/60 rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-slate-700" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-700 rounded w-3/4" />
        <div className="h-2.5 bg-slate-700 rounded w-1/2" />
        <div className="h-2.5 bg-slate-700 rounded w-1/4 mt-3" />
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-slate-800/60 rounded-lg animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-slate-700 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-slate-700 rounded w-48" />
        <div className="h-2.5 bg-slate-700 rounded w-32" />
      </div>
      <div className="h-5 w-16 bg-slate-700 rounded-full" />
      <div className="h-2.5 w-12 bg-slate-700 rounded" />
    </div>
  );
}

// ── stat card ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-semibold text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────

export default function FilesPage() {
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<MimeCategory | "">("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [projects, setProjects] = useState<Pick<Project, "id" | "name">[]>([]);
  const [clients, setClients] = useState<Pick<ClientSummary, "id" | "name" | "companyName">[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AssetFile | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch projects and clients for filter dropdowns
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      const list: Pick<Project, "id" | "name">[] = Array.isArray(d) ? d : (d.projects ?? []);
      setProjects(list);
    }).catch(() => {});
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : (d.clients ?? []);
      setClients(list);
    }).catch(() => {});
  }, []);

  // ── fetch files ───────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load files");
      const data: AssetFile[] = await res.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Database not connected");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, debouncedSearch]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── client-side project / client filter ───────────────────────

  const filteredFiles = files.filter((f) => {
    if (filterProjectId && f.projectId !== filterProjectId) return false;
    if (filterClientId && f.clientId !== filterClientId) return false;
    return true;
  });

  // ── stats ─────────────────────────────────────────────────────

  const stats: Stats = {
    total: filteredFiles.length,
    images: filteredFiles.filter((f) => f.mimeCategory === "image").length,
    videos: filteredFiles.filter((f) => f.mimeCategory === "video").length,
    inReview: filteredFiles.filter((f) => f.status === "IN_REVIEW").length,
    approved: filteredFiles.filter((f) => f.status === "APPROVED").length,
  };

  // ── handlers ──────────────────────────────────────────────────

  const handleUploaded = useCallback((file: AssetFile) => {
    setFiles((prev) => [file, ...prev]);
  }, []);

  const handleFileClick = useCallback((file: AssetFile) => {
    setSelectedFile(file);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const handleModalUpdated = useCallback(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-slate-950 p-4 sm:p-6 space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Files &amp; Assets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage, review, and approve all creative assets
          </p>
        </div>
        <button
          onClick={() => setUploadOpen((o) => !o)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <Upload className="w-4 h-4" />
          Upload Files
        </button>
      </div>

      {/* error banner */}
      {error && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">
            Database not connected — {error}
          </span>
        </div>
      )}

      {/* stats */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Total Files"
            value={stats.total}
            icon={<HardDrive className="w-5 h-5 text-slate-300" />}
            color="bg-slate-700"
          />
          <StatCard
            label="Images"
            value={stats.images}
            icon={<Image className="w-5 h-5 text-violet-300" />}
            color="bg-violet-500/20"
          />
          <StatCard
            label="Videos"
            value={stats.videos}
            icon={<Video className="w-5 h-5 text-blue-300" />}
            color="bg-blue-500/20"
          />
          <StatCard
            label="In Review"
            value={stats.inReview}
            icon={<FileText className="w-5 h-5 text-amber-300" />}
            color="bg-amber-500/20"
          />
          <StatCard
            label="Approved"
            value={stats.approved}
            icon={<FileIcon className="w-5 h-5 text-emerald-300" />}
            color="bg-emerald-500/20"
          />
        </div>
      )}

      {/* upload zone (expandable) */}
      {uploadOpen && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <FileUploadZone onUploaded={handleUploaded} />
        </div>
      )}

      {/* filter bar */}
      <div className="space-y-3">
        {/* search + view toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files by name or description..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={filterClientId}
            onChange={(e) => { setFilterClientId(e.target.value); setFilterProjectId(""); }}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded transition-colors ${
                view === "grid"
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded transition-colors ${
                view === "list"
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* status tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* category tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() =>
                setCategoryFilter(tab.value as MimeCategory | "")
              }
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                categoryFilter === tab.value
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonListRow key={i} />
            ))}
          </div>
        )
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-600">
          <Folder className="w-16 h-16" />
          <div className="text-center">
            <p className="text-base font-medium text-slate-400">No files found</p>
            <p className="text-sm mt-1">
              {debouncedSearch || statusFilter || categoryFilter || filterProjectId || filterClientId
                ? "Try adjusting your filters"
                : "Upload your first file to get started"}
            </p>
          </div>
          {!debouncedSearch && !statusFilter && !categoryFilter && !filterProjectId && !filterClientId && (
            <button
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Files
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredFiles.map((file) => (
            <FileCard key={file.id} file={file} onClick={handleFileClick} view="grid" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredFiles.map((file) => (
            <FileCard key={file.id} file={file} onClick={handleFileClick} view="list" />
          ))}
        </div>
      )}

      {/* review modal */}
      {selectedFile && (
        <FileReviewModal
          file={selectedFile}
          onClose={handleModalClose}
          onUpdated={handleModalUpdated}
          projectId={selectedFile.projectId ?? undefined}
        />
      )}
    </div>
  );
}
