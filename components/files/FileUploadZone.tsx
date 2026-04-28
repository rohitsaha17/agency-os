"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, CheckCircle, XCircle, Loader2, FolderUp, Sparkles, Tag, Link2, Folder, Building2, Briefcase } from "lucide-react";
import type { AssetFile } from "@/types";

// ── types ──────────────────────────────────────────────────────

interface AISuggestion {
  suggestedTags: string[];
  suggestedDescription: string;
  category: string;
  confidence: string;
}

interface UploadItem {
  id: string;
  file: File;
  progress: "uploading" | "done" | "error";
  errorMsg?: string;
  result?: AssetFile;
  aiSuggestion?: AISuggestion;
  aiLoading?: boolean;
  aiApplied?: boolean;
}

interface LinkOption {
  id: string;
  name: string;
}

interface FileUploadZoneProps {
  clientId?: string;
  projectId?: string;
  taskId?: string;
  folderId?: string;
  onUploaded?: (file: AssetFile) => void;
  /** compact=true renders just a small "Upload Files" button */
  compact?: boolean;
  /** Show project/client/folder selectors for linking files during upload */
  showLinkOptions?: boolean;
}

// ── helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── component ──────────────────────────────────────────────────

export function FileUploadZone({
  clientId,
  projectId,
  taskId,
  folderId,
  onUploaded,
  compact = false,
  showLinkOptions = false,
}: FileUploadZoneProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── link options state ─────────────────────────────────────
  const [projects, setProjects] = useState<LinkOption[]>([]);
  const [clients, setClients] = useState<LinkOption[]>([]);
  const [folders, setFolders] = useState<LinkOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [selectedClientId, setSelectedClientId] = useState(clientId || "");
  const [selectedFolderId, setSelectedFolderId] = useState(folderId || "");

  useEffect(() => {
    if (!showLinkOptions) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.projects ?? []);
        setProjects(list.map((p: any) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.clients ?? []);
        setClients(list.map((c: any) => ({ id: c.id, name: c.companyName || c.name })));
      })
      .catch(() => {});
    fetch("/api/folders")
      .then((r) => r.json())
      .then((d: LinkOption[]) => setFolders(d.map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, [showLinkOptions]);

  // Resolve effective IDs — props take priority, then user selection
  const effectiveProjectId = projectId || selectedProjectId || undefined;
  const effectiveClientId = clientId || selectedClientId || undefined;
  const effectiveFolderId = folderId || selectedFolderId || undefined;

  const uploadFile = useCallback(
    async (file: File) => {
      const id = `${Date.now()}_${Math.random()}`;

      setItems((prev) => [
        ...prev,
        { id, file, progress: "uploading" },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (effectiveClientId) formData.append("clientId", effectiveClientId);
        if (effectiveProjectId) formData.append("projectId", effectiveProjectId);
        if (taskId) formData.append("taskId", taskId);
        if (effectiveFolderId) formData.append("folderId", effectiveFolderId);

        const res = await fetch("/api/files", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Upload failed");
        }

        const result: AssetFile = await res.json();

        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, progress: "done", result, aiLoading: true } : item
          )
        );

        onUploaded?.(result);

        // Trigger AI classification in background
        try {
          const classifyRes = await fetch("/api/ai/classify-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type,
              projectName: projectId ? undefined : undefined,
            }),
          });
          if (classifyRes.ok) {
            const suggestion: AISuggestion = await classifyRes.json();
            setItems((prev) =>
              prev.map((item) =>
                item.id === id ? { ...item, aiSuggestion: suggestion, aiLoading: false } : item
              )
            );
          } else {
            setItems((prev) =>
              prev.map((item) =>
                item.id === id ? { ...item, aiLoading: false } : item
              )
            );
          }
        } catch {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, aiLoading: false } : item
            )
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, progress: "error", errorMsg: msg }
              : item
          )
        );
      }
    },
    [effectiveClientId, effectiveProjectId, effectiveFolderId, taskId, onUploaded]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach(uploadFile);
    },
    [uploadFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles]
  );

  const handleApplyAI = useCallback(async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item?.result?.id || !item.aiSuggestion) return;
    try {
      await fetch(`/api/files/${item.result.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: item.aiSuggestion.suggestedDescription,
        }),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, aiApplied: true } : i))
      );
    } catch { /* ignore */ }
  }, [items]);

  const handleDismissAI = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, aiSuggestion: undefined } : i))
    );
  }, []);

  // ── compact mode ───────────────────────────────────────────

  if (compact) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload Files
        </button>

        {items.length > 0 && (
          <div className="mt-3 space-y-1">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} onApplyAI={handleApplyAI} onDismissAI={handleDismissAI} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── full dropzone ──────────────────────────────────────────

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      {/* Link options — project / client / folder selectors */}
      {showLinkOptions && (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-indigo-400" />
            <p className="text-xs font-medium text-slate-300">Link uploaded files to</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                <Briefcase className="w-3 h-3" /> Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!!projectId}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                <Building2 className="w-3 h-3" /> Client
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                disabled={!!clientId}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">None</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                <Folder className="w-3 h-3" /> Folder
              </label>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                disabled={!!folderId}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">None (root)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors
          ${
            dragging
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-slate-700 bg-slate-800/50 hover:border-indigo-500/60 hover:bg-slate-800"
          }
        `}
      >
        <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center">
          <FolderUp className="w-7 h-7 text-indigo-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-200">
            Drag &amp; drop or click to browse
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Images, videos, PDFs, documents — any file type
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onApplyAI={handleApplyAI} onDismissAI={handleDismissAI} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── UploadRow sub-component ────────────────────────────────────

function UploadRow({ item, onApplyAI, onDismissAI }: {
  item: UploadItem;
  onApplyAI?: (itemId: string) => void;
  onDismissAI?: (itemId: string) => void;
}) {
  return (
    <div className="bg-slate-800 rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">{item.file.name}</p>
          {item.progress === "error" ? (
            <p className="text-xs text-red-400 mt-0.5">{item.errorMsg}</p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">
              {formatBytes(item.file.size)}
            </p>
          )}
        </div>

        <div className="flex-shrink-0">
          {item.progress === "uploading" && (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          )}
          {item.progress === "done" && !item.aiLoading && (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          {item.aiLoading && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="text-[10px] text-indigo-400">Classifying...</span>
            </div>
          )}
          {item.progress === "error" && (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
      </div>

      {/* AI Suggestion Banner */}
      {item.aiSuggestion && !item.aiApplied && (
        <div className="mt-2 bg-indigo-900/50 border border-indigo-700/50 rounded-lg p-2.5">
          <div className="flex items-start gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-300 font-medium">AI suggests tags & description</p>
          </div>
          {item.aiSuggestion.suggestedDescription && (
            <p className="text-xs text-slate-400 pl-5.5 mb-1.5 ml-5">{item.aiSuggestion.suggestedDescription}</p>
          )}
          {item.aiSuggestion.suggestedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-5 mb-2">
              {item.aiSuggestion.suggestedTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-indigo-800/60 text-indigo-300 rounded font-medium">
                  <Tag className="w-2.5 h-2.5" />{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 ml-5">
            <button
              onClick={() => onApplyAI?.(item.id)}
              className="text-[11px] px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium"
            >
              Apply suggestions
            </button>
            <button
              onClick={() => onDismissAI?.(item.id)}
              className="text-[11px] px-2 py-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {item.aiApplied && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 ml-1">
          <CheckCircle className="w-3 h-3" /> AI tags applied
        </div>
      )}
    </div>
  );
}
