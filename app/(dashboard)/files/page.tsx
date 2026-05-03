"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Grid3X3,
  List,
  Search,
  Folder as FolderIcon,
  FolderPlus,
  FolderOpen,
  HardDrive,
  Image,
  Video,
  FileText,
  File as FileIcon,
  AlertTriangle,
  ChevronRight,
  X,
  Check,
  Loader2,
  Briefcase,
  Building2,
  Clock,
  ArrowLeft,
} from "lucide-react";
import type {
  AssetFile,
  FileStatus,
  MimeCategory,
  Project,
  ClientSummary,
  Folder,
  FolderScope,
} from "@/types";
import { FileCard } from "@/components/files/FileCard";
import { FileUploadZone } from "@/components/files/FileUploadZone";
import { FileReviewModal } from "@/components/files/FileReviewModal";
import { toast } from "@/lib/toast";

// ── types ──────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

/** "hub" = organized containers at root, "browse" = flat folder/file browsing */
type PageMode = "hub" | "browse";

type ScopeTab = "" | "PROJECT" | "CLIENT" | "COMMON";

interface ProjectContainer {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  fileCount: number;
}

interface ClientContainer {
  id: string;
  name: string;
  fileCount: number;
}

interface BreadcrumbItem {
  id: string | null; // null = root
  name: string;
}

interface Stats {
  total: number;
  images: number;
  videos: number;
  inReview: number;
  approved: number;
}

// ── constants ─────────────────────────────────────────────────

const SCOPE_TABS: { label: string; value: ScopeTab }[] = [
  { label: "All", value: "" },
  { label: "Project Files", value: "PROJECT" },
  { label: "Client Files", value: "CLIENT" },
  { label: "Common Files", value: "COMMON" },
];

const STATUS_TABS: { label: string; value: FileStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "In Review", value: "IN_REVIEW" },
  { label: "Approved", value: "APPROVED" },
  { label: "Changes Required", value: "CHANGES_REQUIRED" },
];

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

// ── skeleton components ───────────────────────────────────────

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

function SkeletonFolderCard() {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-slate-700 mb-3" />
      <div className="h-3.5 bg-slate-700 rounded w-3/4 mb-2" />
      <div className="h-2.5 bg-slate-700 rounded w-1/2" />
    </div>
  );
}

// ── container cards for hub view ──────────────────────────────

function ProjectContainerCard({
  project,
  onClick,
}: {
  project: ProjectContainer;
  onClick: (id: string) => void;
}) {
  // Map every ProjectStatus enum value to a distinct semantic color
  // so badges aren't all generic gray.
  const statusColor =
    project.status === "ACTIVE"
      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
      : project.status === "COMPLETED"
        ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30"
        : project.status === "ON_HOLD"
          ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
          : project.status === "CANCELLED"
            ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/30"
            : "bg-slate-600/40 text-slate-300 ring-1 ring-slate-500/30"; // DRAFT

  return (
    <button
      onClick={() => onClick(project.id)}
      className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-indigo-500/40 transition-all text-left group w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300" />
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
          {project.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white">
        {project.name}
      </p>
      {project.clientName && (
        <p className="text-xs text-slate-600 mt-0.5 truncate">{project.clientName}</p>
      )}
      <div className="flex items-center gap-1.5 mt-2.5">
        <FileIcon className="w-3 h-3 text-slate-600" />
        <span className="text-xs text-slate-500">
          {project.fileCount} file{project.fileCount !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}

function ClientContainerCard({
  client,
  onClick,
}: {
  client: ClientContainer;
  onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(client.id)}
      className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-emerald-500/40 transition-all text-left group w-full"
    >
      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-3">
        <Building2 className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300" />
      </div>
      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white">
        {client.name}
      </p>
      <div className="flex items-center gap-1.5 mt-2.5">
        <FileIcon className="w-3 h-3 text-slate-600" />
        <span className="text-xs text-slate-500">
          {client.fileCount} file{client.fileCount !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}

// ── stat card ─────────────────────────────────────────────────

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
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xl font-semibold text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ── folder card ───────────────────────────────────────────────

function FolderCard({
  folder,
  onClick,
  view,
}: {
  folder: Folder;
  onClick: (folder: Folder) => void;
  view: ViewMode;
}) {
  const itemCount =
    (folder._count?.files ?? 0) + (folder._count?.children ?? 0);

  if (view === "list") {
    return (
      <button
        onClick={() => onClick(folder)}
        className="w-full flex items-center gap-4 px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-lg hover:bg-slate-700/60 hover:border-slate-600 transition-colors text-left group"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <FolderIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white">
            {folder.name}
          </p>
          <p className="text-xs text-slate-500">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
            {folder.project?.name && (
              <span className="ml-2 text-slate-600">
                {folder.project.name}
              </span>
            )}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
      </button>
    );
  }

  return (
    <button
      onClick={() => onClick(folder)}
      className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-slate-600 transition-colors text-left group w-full"
    >
      <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center mb-3">
        <FolderIcon className="w-5 h-5 text-amber-400 group-hover:text-amber-300" />
      </div>
      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white">
        {folder.name}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {itemCount} item{itemCount !== 1 ? "s" : ""}
      </p>
      {folder.project?.name && (
        <p className="text-xs text-slate-600 mt-1 truncate">
          {folder.project.name}
        </p>
      )}
    </button>
  );
}

// ── inline folder creator ────────────────────────────────────

function InlineFolderCreator({
  onCreated,
  onCancel,
  parentId,
  projectId,
  clientId,
  scope,
}: {
  onCreated: (folder: Folder) => void;
  onCancel: () => void;
  parentId: string | null;
  projectId: string;
  clientId: string;
  scope: ScopeTab;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      const body: Record<string, string> = { name: trimmed };
      if (parentId) body.parentId = parentId;
      if (projectId) body.projectId = projectId;
      if (clientId) body.clientId = clientId;

      // Determine scope: inherit from parent context or use the scope tab
      if (scope === "PROJECT" || scope === "CLIENT" || scope === "COMMON") {
        body.scope = scope;
      } else if (projectId) {
        body.scope = "PROJECT";
      } else if (clientId) {
        body.scope = "CLIENT";
      } else {
        body.scope = "COMMON";
      }

      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to create folder");
      const folder: Folder = await res.json();
      onCreated(folder);
    } catch {
      // Silently fail — the user can try again
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="bg-slate-800/60 border border-indigo-500/50 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <FolderPlus className="w-5 h-5 text-amber-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!name.trim()) onCancel();
          }}
          placeholder="Folder name..."
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
          disabled={saving}
        />
        <div className="flex items-center gap-1">
          {saving ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── breadcrumb ────────────────────────────────────────────────

function Breadcrumb({
  items,
  onNavigate,
}: {
  items: BreadcrumbItem[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-0.5">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.id ?? "root"} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            )}
            {isLast ? (
              <span className="text-slate-200 font-medium flex-shrink-0">
                {item.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(item.id)}
                className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
              >
                {item.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ── page ──────────────────────────────────────────────────────

export default function FilesPage() {
  // ── page mode: hub (organized containers) vs browse (flat folders/files)
  const [pageMode, setPageMode] = useState<PageMode>("hub");

  // ── hub data ────────────────────────────────────────────────
  const [projectContainers, setProjectContainers] = useState<ProjectContainer[]>([]);
  const [clientContainers, setClientContainers] = useState<ClientContainer[]>([]);
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubLabel, setHubLabel] = useState<string | null>(null);

  // ── folder navigation state ─────────────────────────────────
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([
    { id: null, name: "All Files" },
  ]);

  // ── data state ──────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── view & filter state ─────────────────────────────────────
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeTab>("");
  const [statusFilter, setStatusFilter] = useState<FileStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<MimeCategory | "">("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");

  // ── reference data ──────────────────────────────────────────
  const [projects, setProjects] = useState<Pick<Project, "id" | "name">[]>([]);
  const [clients, setClients] = useState<
    Pick<ClientSummary, "id" | "name" | "companyName">[]
  >([]);

  // ── ui state ────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AssetFile | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // ── debounced search ────────────────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── fetch projects and clients for dropdowns ────────────────
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        const list: Pick<Project, "id" | "name">[] = Array.isArray(d)
          ? d
          : (d.projects ?? []);
        setProjects(list);
      })
      .catch(() => {});
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.clients ?? []);
        setClients(list);
      })
      .catch(() => {});
  }, []);

  // ── fetch hub container data ────────────────────────────────
  const fetchHubData = useCallback(async () => {
    setHubLoading(true);
    try {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProjectContainers(data.byProject || []);
      setClientContainers(data.byClient || []);
      setUnlinkedCount(data.unlinkedCount || 0);
    } catch {
      // Fall back to browse mode if stats fail
      setPageMode("browse");
    } finally {
      setHubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageMode === "hub") fetchHubData();
  }, [pageMode, fetchHubData]);

  // ── build folder query params ───────────────────────────────

  const buildFolderParams = useCallback(() => {
    const params = new URLSearchParams();

    if (currentFolderId) {
      params.set("parentId", currentFolderId);
    } else {
      params.set("parentId", "null");
    }

    if (scopeFilter) params.set("scope", scopeFilter);
    if (filterProjectId) params.set("projectId", filterProjectId);
    if (filterClientId) params.set("clientId", filterClientId);

    return params;
  }, [currentFolderId, scopeFilter, filterProjectId, filterClientId]);

  // ── build file query params ─────────────────────────────────

  const buildFileParams = useCallback(() => {
    const params = new URLSearchParams();

    if (currentFolderId) {
      params.set("folderId", currentFolderId);
    } else {
      params.set("folderId", "null");
    }

    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterProjectId) params.set("projectId", filterProjectId);
    if (filterClientId) params.set("clientId", filterClientId);

    return params;
  }, [
    currentFolderId,
    statusFilter,
    categoryFilter,
    debouncedSearch,
    filterProjectId,
    filterClientId,
  ]);

  // ── fetch folders ───────────────────────────────────────────

  const fetchFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const params = buildFolderParams();
      const res = await fetch(`/api/folders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load folders");
      const data: Folder[] = await res.json();
      setFolders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
    } finally {
      setLoadingFolders(false);
    }
  }, [buildFolderParams]);

  // ── fetch files ─────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const params = buildFileParams();
      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load files");
      const data: AssetFile[] = await res.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Database not connected");
    } finally {
      setLoadingFiles(false);
    }
  }, [buildFileParams]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── navigation ──────────────────────────────────────────────

  const navigateToFolder = useCallback(
    async (folder: Folder) => {
      setCurrentFolderId(folder.id);
      setCreatingFolder(false);

      // Build breadcrumb path by appending
      setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    },
    []
  );

  const navigateToBreadcrumb = useCallback(
    (targetId: string | null) => {
      // Root is always valid.
      if (targetId === null) {
        setCurrentFolderId(null);
        setCreatingFolder(false);
        setFolderPath([{ id: null, name: "All Files" }]);
        return;
      }

      // The crumb is valid if it's already in our current folderPath
      // (i.e. it's an ancestor of the current folder we walked into) OR
      // if it's present in the currently loaded `folders` list.
      const inPath = folderPath.some((item) => item.id === targetId);
      const inCurrentFolders = folders.some((f) => f.id === targetId);

      if (!inPath && !inCurrentFolders) {
        toast.error("Folder no longer exists");
        setCurrentFolderId(null);
        setCreatingFolder(false);
        setFolderPath([{ id: null, name: "All Files" }]);
        return;
      }

      setCurrentFolderId(targetId);
      setCreatingFolder(false);

      // Truncate path to the target level
      setFolderPath((prev) => {
        const idx = prev.findIndex((item) => item.id === targetId);
        if (idx >= 0) return prev.slice(0, idx + 1);
        return prev;
      });
    },
    [folderPath, folders]
  );

  // ── stats ───────────────────────────────────────────────────

  const stats: Stats = useMemo(
    () => ({
      total: files.length,
      images: files.filter((f) => f.mimeCategory === "image").length,
      videos: files.filter((f) => f.mimeCategory === "video").length,
      inReview: files.filter((f) => f.status === "IN_REVIEW").length,
      approved: files.filter((f) => f.status === "APPROVED").length,
    }),
    [files]
  );

  // ── handlers ────────────────────────────────────────────────

  const loading = loadingFolders || loadingFiles;

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

  const handleFolderCreated = useCallback((folder: Folder) => {
    setFolders((prev) => [folder, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
    setCreatingFolder(false);
  }, []);

  const handleScopeChange = useCallback((scope: ScopeTab) => {
    setScopeFilter(scope);
    // Reset to root when changing scope
    setCurrentFolderId(null);
    setFolderPath([{ id: null, name: "All Files" }]);
    setCreatingFolder(false);
  }, []);

  // ── hub navigation handlers ─────────────────────────────────

  const handleProjectContainerClick = useCallback(
    (projectId: string) => {
      const proj = projectContainers.find((p) => p.id === projectId);
      setFilterProjectId(projectId);
      setFilterClientId("");
      setHubLabel(proj?.name || "Project");
      setPageMode("browse");
    },
    [projectContainers]
  );

  const handleClientContainerClick = useCallback(
    (clientId: string) => {
      const cli = clientContainers.find((c) => c.id === clientId);
      setFilterClientId(clientId);
      setFilterProjectId("");
      setHubLabel(cli?.name || "Client");
      setPageMode("browse");
    },
    [clientContainers]
  );

  const handleShowAllFiles = useCallback(() => {
    setFilterProjectId("");
    setFilterClientId("");
    setHubLabel(null);
    setPageMode("browse");
  }, []);

  const handleShowUnlinked = useCallback(() => {
    setFilterProjectId("");
    setFilterClientId("");
    setHubLabel("Unlinked Files");
    setPageMode("browse");
  }, []);

  const handleBackToHub = useCallback(() => {
    setFilterProjectId("");
    setFilterClientId("");
    setScopeFilter("");
    setStatusFilter("");
    setCategoryFilter("");
    setSearch("");
    setCurrentFolderId(null);
    setFolderPath([{ id: null, name: "All Files" }]);
    setCreatingFolder(false);
    setHubLabel(null);
    setPageMode("hub");
  }, []);

  // ── is root level ──────────────────────────────────────────

  const isRoot = currentFolderId === null;

  // ── empty state conditions ─────────────────────────────────

  const hasActiveFilters =
    !!debouncedSearch ||
    !!statusFilter ||
    !!categoryFilter ||
    !!filterProjectId ||
    !!filterClientId ||
    !!scopeFilter;

  const isEmpty = !loading && folders.length === 0 && files.length === 0;

  // ── render ──────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-slate-950 p-4 sm:p-6 space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          {pageMode === "browse" && (
            <button
              onClick={handleBackToHub}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Back to overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {hubLabel ? hubLabel : "Files & Assets"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {pageMode === "hub"
                ? "Browse files organized by project, client, or folder"
                : "Manage, review, and approve creative assets"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pageMode === "hub" && (
            <button
              onClick={handleShowAllFiles}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
            >
              <List className="w-4 h-4" />
              Browse All
            </button>
          )}
          {pageMode === "browse" && (
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New Folder
            </button>
          )}
          <button
            onClick={() => setUploadOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Files
          </button>
        </div>
      </div>

      {/* upload zone (expandable) — available in both modes */}
      {uploadOpen && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <FileUploadZone
            onUploaded={(file) => {
              handleUploaded(file);
              if (pageMode === "hub") fetchHubData();
            }}
            projectId={filterProjectId || undefined}
            clientId={filterClientId || undefined}
            folderId={currentFolderId || undefined}
            showLinkOptions
          />
        </div>
      )}

      {/* error banner */}
      {error && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Database not connected — {error}</span>
        </div>
      )}

      {/* ═══════════ HUB VIEW ═══════════ */}
      {pageMode === "hub" && (
        <>
          {hubLoading ? (
            <div className="space-y-8">
              <div>
                <div className="h-4 bg-slate-800 rounded w-32 mb-4" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-slate-800/60 rounded-xl p-4 animate-pulse">
                      <div className="w-10 h-10 rounded-lg bg-slate-700 mb-3" />
                      <div className="h-3.5 bg-slate-700 rounded w-3/4 mb-2" />
                      <div className="h-2.5 bg-slate-700 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Projects section */}
              {projectContainers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase className="w-4 h-4 text-indigo-400" />
                    <h2 className="text-sm font-semibold text-slate-300">
                      By Project
                    </h2>
                    <span className="text-xs text-slate-600">
                      ({projectContainers.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {projectContainers.map((p) => (
                      <ProjectContainerCard
                        key={p.id}
                        project={p}
                        onClick={handleProjectContainerClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Clients section */}
              {clientContainers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-slate-300">
                      By Client
                    </h2>
                    <span className="text-xs text-slate-600">
                      ({clientContainers.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {clientContainers.map((c) => (
                      <ClientContainerCard
                        key={c.id}
                        client={c}
                        onClick={handleClientContainerClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Quick access section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FolderIcon className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-slate-300">
                    Quick Access
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <button
                    onClick={handleShowAllFiles}
                    className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-slate-600 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center mb-3">
                      <HardDrive className="w-5 h-5 text-slate-400 group-hover:text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white">
                      All Files
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Browse everything</p>
                  </button>

                  {unlinkedCount > 0 && (
                    <button
                      onClick={handleShowUnlinked}
                      className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-amber-500/40 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center mb-3">
                        <FileIcon className="w-5 h-5 text-amber-400 group-hover:text-amber-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white">
                        Unlinked Files
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {unlinkedCount} file{unlinkedCount !== 1 ? "s" : ""} not linked to any project or client
                      </p>
                    </button>
                  )}

                  <button
                    onClick={() => { setPageMode("browse"); setHubLabel("Folders"); }}
                    className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 hover:border-slate-600 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center mb-3">
                      <FolderIcon className="w-5 h-5 text-amber-400 group-hover:text-amber-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white">
                      All Folders
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Browse folder structure</p>
                  </button>
                </div>
              </div>

              {/* Empty state */}
              {projectContainers.length === 0 && clientContainers.length === 0 && unlinkedCount === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-600">
                  <FolderOpen className="w-16 h-16" />
                  <div className="text-center">
                    <p className="text-base font-medium text-slate-400">
                      No files yet
                    </p>
                    <p className="text-sm mt-1">
                      Upload your first file to get started
                    </p>
                  </div>
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════ BROWSE VIEW ═══════════ */}
      {pageMode === "browse" && (
        <div className="space-y-6">

      {/* breadcrumb */}
      {folderPath.length > 1 && (
        <Breadcrumb items={folderPath} onNavigate={navigateToBreadcrumb} />
      )}

      {/* scope tabs (shown at root) */}
      {isRoot && (
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {SCOPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleScopeChange(tab.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scopeFilter === tab.value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
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

      {/* filter bar */}
      <div className="space-y-3">
        {/* search + dropdowns + view toggle */}
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
            onChange={(e) => {
              setFilterClientId(e.target.value);
              setFilterProjectId("");
            }}
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
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
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
              onClick={() => setCategoryFilter(tab.value as MimeCategory | "")}
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

      {/* content area */}
      {loading ? (
        /* skeleton loading */
        view === "grid" ? (
          <div className="space-y-6">
            {/* folder skeletons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonFolderCard key={`sf-${i}`} />
              ))}
            </div>
            {/* file skeletons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={`sc-${i}`} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonListRow key={`sfr-${i}`} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonListRow key={`slr-${i}`} />
            ))}
          </div>
        )
      ) : isEmpty && !creatingFolder ? (
        /* empty state */
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-600">
          <FolderOpen className="w-16 h-16" />
          <div className="text-center">
            <p className="text-base font-medium text-slate-400">
              {currentFolderId ? "This folder is empty" : "No files found"}
            </p>
            <p className="text-sm mt-1">
              {hasActiveFilters
                ? "Try adjusting your filters"
                : currentFolderId
                  ? "Add files or create subfolders to get started"
                  : "Upload your first file to get started"}
            </p>
          </div>
          {!hasActiveFilters && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreatingFolder(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              <button
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Files
              </button>
            </div>
          )}
        </div>
      ) : (
        /* folders + files */
        <div className="space-y-6">
          {/* folders section */}
          {(folders.length > 0 || creatingFolder) && (
            <div>
              {folders.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <FolderIcon className="w-4 h-4 text-slate-500" />
                  <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Folders
                  </h2>
                  <span className="text-xs text-slate-600">
                    ({folders.length})
                  </span>
                </div>
              )}

              {view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {/* inline creator */}
                  {creatingFolder && (
                    <InlineFolderCreator
                      onCreated={handleFolderCreated}
                      onCancel={() => setCreatingFolder(false)}
                      parentId={currentFolderId}
                      projectId={filterProjectId}
                      clientId={filterClientId}
                      scope={scopeFilter}
                    />
                  )}
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={navigateToFolder}
                      view="grid"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {creatingFolder && (
                    <InlineFolderCreator
                      onCreated={handleFolderCreated}
                      onCancel={() => setCreatingFolder(false)}
                      parentId={currentFolderId}
                      projectId={filterProjectId}
                      clientId={filterClientId}
                      scope={scopeFilter}
                    />
                  )}
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={navigateToFolder}
                      view="list"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* inline creator when there are no folders but we are creating */}
          {creatingFolder && folders.length === 0 && (
            <div>
              {view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  <InlineFolderCreator
                    onCreated={handleFolderCreated}
                    onCancel={() => setCreatingFolder(false)}
                    parentId={currentFolderId}
                    projectId={filterProjectId}
                    clientId={filterClientId}
                    scope={scopeFilter}
                  />
                </div>
              ) : (
                <InlineFolderCreator
                  onCreated={handleFolderCreated}
                  onCancel={() => setCreatingFolder(false)}
                  parentId={currentFolderId}
                  projectId={filterProjectId}
                  clientId={filterClientId}
                  scope={scopeFilter}
                />
              )}
            </div>
          )}

          {/* files section */}
          {files.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileIcon className="w-4 h-4 text-slate-500" />
                <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Files
                </h2>
                <span className="text-xs text-slate-600">
                  ({files.length})
                </span>
              </div>

              {view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {files.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onClick={handleFileClick}
                      view="grid"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {files.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onClick={handleFileClick}
                      view="list"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
