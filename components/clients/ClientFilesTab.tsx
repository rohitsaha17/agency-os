"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Grid3X3, List, FolderOpen, HardDrive, FolderPlus, Plus, Upload, X,
} from "lucide-react";
import type { AssetFile, FileStatus, ClientProject } from "@/types";
import { FileCard } from "@/components/files/FileCard";
import { FileUploadZone } from "@/components/files/FileUploadZone";
import { FileReviewModal } from "@/components/files/FileReviewModal";
import { Button } from "@/components/ui/Button";

const STATUS_TABS: { label: string; value: FileStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "In Review", value: "IN_REVIEW" },
  { label: "Approved", value: "APPROVED" },
  { label: "Changes", value: "CHANGES_REQUIRED" },
];

interface ClientFilesTabProps {
  clientId: string;
  /** This client's projects — used to group files by project. */
  projects: Pick<ClientProject, "id" | "name">[];
}

/**
 * Functional Files workspace scoped to one client.
 * - Drag-drop upload via FileUploadZone (clientId locked)
 * - Grid + list view toggle
 * - Search + status filter
 * - Files grouped by project (and a "Direct (no project)" bucket)
 * - Click any file to open the review modal
 */
export function ClientFilesTab({ clientId, projects }: ClientFilesTabProps) {
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatus | "">("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AssetFile | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/files?clientId=${clientId}`);
      if (!res.ok) return;
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : data.data ?? []);
    } finally {
      setLoaded(true);
    }
  }, [clientId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Apply search + status filters client-side (small dataset)
  const visibleFiles = useMemo(() => {
    return files.filter((f) => {
      if (statusFilter && f.status !== statusFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const hay = `${f.name} ${f.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [files, statusFilter, debouncedSearch]);

  // Group: "Direct (no project)" + one bucket per project that has files
  const groups = useMemo(() => {
    const direct = visibleFiles.filter((f) => !f.projectId);
    const byProject = new Map<string, { name: string; files: AssetFile[] }>();
    for (const f of visibleFiles) {
      if (!f.projectId) continue;
      const proj = projects.find((p) => p.id === f.projectId);
      const name = f.project?.name ?? proj?.name ?? "Project";
      if (!byProject.has(f.projectId)) byProject.set(f.projectId, { name, files: [] });
      byProject.get(f.projectId)!.files.push(f);
    }
    const result: { key: string; label: string; projectId: string | null; files: AssetFile[] }[] = [];
    if (direct.length) result.push({ key: "direct", label: "Direct (no project)", projectId: null, files: direct });
    for (const [pid, g] of byProject) {
      result.push({ key: pid, label: g.name, projectId: pid, files: g.files });
    }
    return result;
  }, [visibleFiles, projects]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex bg-white border border-gray-300 rounded-lg p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded transition-colors ${
                view === "grid" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded transition-colors ${
                view === "list" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
        <Button
          size="sm"
          icon={uploadOpen ? <X className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
          onClick={() => setUploadOpen((o) => !o)}
        >
          {uploadOpen ? "Close" : "Upload Files"}
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Upload zone (collapsible) */}
      {uploadOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <FileUploadZone
            clientId={clientId}
            showLinkOptions
            onUploaded={() => {
              fetchFiles();
            }}
          />
        </div>
      )}

      {/* Content */}
      {!loaded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl aspect-[4/3] animate-pulse" />
          ))}
        </div>
      ) : visibleFiles.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <HardDrive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {files.length === 0 ? "No files uploaded yet." : "No files match your filters."}
          </p>
          {files.length === 0 && (
            <Button size="sm" className="mt-3" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setUploadOpen(true)}>
              Upload first file
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-3">
                {g.projectId ? (
                  <FolderOpen className="w-4 h-4 text-indigo-400" />
                ) : (
                  <FolderPlus className="w-4 h-4 text-gray-400" />
                )}
                <h3 className="text-sm font-medium text-gray-700">{g.label}</h3>
                <span className="text-xs text-gray-400">({g.files.length})</span>
              </div>
              {view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {g.files.map((f) => (
                    <FileCard key={f.id} file={f} onClick={setSelectedFile} view="grid" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {g.files.map((f) => (
                    <FileCard key={f.id} file={f} onClick={setSelectedFile} view="list" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review modal */}
      {selectedFile && (
        <FileReviewModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onUpdated={fetchFiles}
          projectId={selectedFile.projectId ?? undefined}
        />
      )}
    </div>
  );
}
