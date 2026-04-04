"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Image, Film, File as FileIcon,
  Download, History, X, Plus, ChevronDown, ChevronUp,
} from "lucide-react";
import type { AssetFile, FileVersion } from "@/types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FileTypeIcon({ mimeType, className = "w-5 h-5" }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={`${className} text-violet-500`} />;
  if (mimeType.startsWith("video/")) return <Film className={`${className} text-pink-500`} />;
  if (mimeType === "application/pdf") return <FileText className={`${className} text-red-500`} />;
  return <FileIcon className={`${className} text-gray-400`} />;
}

function UploadZone({
  onFiles,
  compact = false,
  label = "Upload files",
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  if (compact) {
    return (
      <div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          {label}
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
        dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
      }`}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); }} />
      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
      <p className="text-sm font-medium text-gray-600">Drop files or click to upload</p>
      <p className="text-xs text-gray-400 mt-0.5">Any file type • Multiple files supported</p>
    </div>
  );
}

interface TaskFilesProps {
  taskId: string;
  projectId: string;
}

export function TaskFiles({ taskId, projectId }: TaskFilesProps) {
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [fileVersions, setFileVersions] = useState<Record<string, FileVersion[]>>({});
  const [loadingVersions, setLoadingVersions] = useState<Set<string>>(new Set());
  const [versionUploading, setVersionUploading] = useState<string | null>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const versionTargetRef = useRef<string | null>(null);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    fetch(`/api/files?taskId=${taskId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFiles(data); })
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const uploadFiles = async (rawFiles: File[]) => {
    setUploading(true);
    try {
      for (const f of rawFiles) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("taskId", taskId);
        fd.append("projectId", projectId);
        await fetch("/api/files", { method: "POST", body: fd });
      }
      fetchFiles();
    } finally {
      setUploading(false);
    }
  };

  const toggleVersions = async (fileId: string) => {
    if (expandedVersions.has(fileId)) {
      setExpandedVersions((prev) => { const s = new Set(prev); s.delete(fileId); return s; });
      return;
    }
    setExpandedVersions((prev) => new Set(prev).add(fileId));
    if (!fileVersions[fileId]) {
      setLoadingVersions((prev) => new Set(prev).add(fileId));
      const data = await fetch(`/api/files/${fileId}/versions`).then((r) => r.json());
      setFileVersions((prev) => ({ ...prev, [fileId]: Array.isArray(data) ? data : [] }));
      setLoadingVersions((prev) => { const s = new Set(prev); s.delete(fileId); return s; });
    }
  };

  const startVersionUpload = (fileId: string) => {
    versionTargetRef.current = fileId;
    versionInputRef.current?.click();
  };

  const handleVersionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = versionTargetRef.current;
    if (!file || !targetId) return;
    e.target.value = "";
    setVersionUploading(targetId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("notes", "");
      await fetch(`/api/files/${targetId}/versions`, { method: "POST", body: fd });
      // Refresh file list and versions
      fetchFiles();
      setFileVersions((prev) => ({ ...prev, [targetId]: [] }));
      if (expandedVersions.has(targetId)) {
        const data = await fetch(`/api/files/${targetId}/versions`).then((r) => r.json());
        setFileVersions((prev) => ({ ...prev, [targetId]: Array.isArray(data) ? data : [] }));
      }
    } finally {
      setVersionUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse p-3 border border-gray-100 rounded-xl">
            <div className="w-9 h-9 bg-gray-200 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden version file input */}
      <input ref={versionInputRef} type="file" className="hidden" onChange={handleVersionUpload} />

      {files.length === 0 ? (
        <UploadZone onFiles={uploadFiles} />
      ) : (
        <>
          {/* File list */}
          <div className="space-y-2">
            {files.map((file) => {
              const versionsShown = expandedVersions.has(file.id);
              const versions = fileVersions[file.id] ?? [];
              const isLoadingVer = loadingVersions.has(file.id);
              const versionCount = file._count?.versions ?? 0;
              const isUploadingVer = versionUploading === file.id;

              return (
                <div key={file.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Main file row */}
                  <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <FileTypeIcon mimeType={file.mimeType} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatSize(file.size)} · {timeAgo(file.createdAt)}
                        {versionCount > 0 && (
                          <span className="ml-1.5 text-indigo-500 font-medium">v{versionCount + 1}</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Upload new version */}
                      <button
                        onClick={() => startVersionUpload(file.id)}
                        disabled={isUploadingVer}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Upload new version"
                      >
                        {isUploadingVer ? (
                          <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Version history toggle */}
                      {versionCount > 0 && (
                        <button
                          onClick={() => toggleVersions(file.id)}
                          className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Version history"
                        >
                          <History className="w-3 h-3" />
                          {versionCount}
                          {versionsShown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      {/* Download */}
                      {file.url && (
                        <a
                          href={file.url}
                          download={file.name}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Version history */}
                  {versionsShown && (
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                      {isLoadingVer ? (
                        <p className="text-xs text-gray-400 py-1">Loading versions…</p>
                      ) : versions.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">No version history</p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Version History</p>
                          {[...versions].reverse().map((v) => (
                            <div key={v.id} className="flex items-center gap-2 text-xs">
                              <span className="w-8 text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded px-1 py-0.5 text-center">
                                v{v.version}
                              </span>
                              <span className="text-gray-500 flex-1 truncate">{v.notes || "No notes"}</span>
                              <span className="text-gray-400 flex-shrink-0">{formatSize(v.size)}</span>
                              <span className="text-gray-400 flex-shrink-0">{timeAgo(v.createdAt)}</span>
                              {v.url && (
                                <a href={v.url} download className="text-gray-400 hover:text-gray-600">
                                  <Download className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Upload more */}
          <UploadZone onFiles={uploadFiles} compact label={uploading ? "Uploading…" : "Upload more files"} />
        </>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-xs text-indigo-600 animate-pulse">
          <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Uploading…
        </div>
      )}
    </div>
  );
}
