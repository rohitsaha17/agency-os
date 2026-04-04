"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, CheckCircle, XCircle, Loader2, FolderUp } from "lucide-react";
import type { AssetFile } from "@/types";

// ── types ──────────────────────────────────────────────────────

interface UploadItem {
  id: string;
  file: File;
  progress: "uploading" | "done" | "error";
  errorMsg?: string;
  result?: AssetFile;
}

interface FileUploadZoneProps {
  clientId?: string;
  projectId?: string;
  taskId?: string;
  onUploaded?: (file: AssetFile) => void;
  /** compact=true renders just a small "Upload Files" button */
  compact?: boolean;
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
  onUploaded,
  compact = false,
}: FileUploadZoneProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        if (clientId) formData.append("clientId", clientId);
        if (projectId) formData.append("projectId", projectId);
        if (taskId) formData.append("taskId", taskId);

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
    [clientId, projectId, taskId, onUploaded]
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
  return (
    <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2.5">
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
        {item.progress === "done" && (
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        )}
        {item.progress === "error" && (
          <XCircle className="w-4 h-4 text-red-400" />
        )}
      </div>
    </div>
  );
}
