"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, CheckCircle, XCircle, Loader2, FolderUp, Link2, Folder, Building2, Briefcase, Pencil, Check } from "lucide-react";
import type { AssetFile } from "@/types";

// ── types ──────────────────────────────────────────────────────

interface UploadItem {
  id: string;
  file: File;
  progress: "uploading" | "done" | "error";
  errorMsg?: string;
  result?: AssetFile;
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
            item.id === id ? { ...item, progress: "done", result } : item
          )
        );

        onUploaded?.(result);
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
              <UploadRow key={item.id} item={item} />
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
            <UploadRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── UploadRow sub-component ────────────────────────────────────

function UploadRow({ item }: { item: UploadItem }) {
  // Inline metadata editor — appears once upload completes so users can add
  // an optional friendly title and description without leaving the page.
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.result?.name ?? item.file.name);
  const [description, setDescription] = useState(item.result?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!item.result?.id) return;
    setSaving(true);
    try {
      await fetch(`/api/files/${item.result.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title.trim() || item.file.name,
          description: description.trim() || null,
        }),
      });
      setSaved(true);
      setEditing(false);
    } catch {
      // ignore — the file is uploaded; metadata edit is optional
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">
            {saved ? title : item.file.name}
          </p>
          {item.progress === "error" ? (
            <p className="text-xs text-red-400 mt-0.5">{item.errorMsg}</p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">
              {formatBytes(item.file.size)}
              {saved && description ? ` · ${description.slice(0, 60)}${description.length > 60 ? "…" : ""}` : ""}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          {item.progress === "uploading" && (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          )}
          {item.progress === "done" && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 transition-colors"
                title="Add title / description (optional)"
              >
                <Pencil className="w-3 h-3" />
                {saved ? "Edit" : "Add details"}
              </button>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </>
          )}
          {item.progress === "error" && (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
      </div>

      {/* Inline metadata editor */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              Title <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={item.file.name}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              Description <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief note about this file…"
              className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-[11px] px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-[11px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
