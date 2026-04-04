"use client";

import {
  FileText,
  FileVideo,
  FileImage,
  File as FileIcon,
  MessageSquare,
  GitBranch,
  Eye,
} from "lucide-react";
import type { AssetFile, FileStatus, MimeCategory } from "@/types";

// ── helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── status badge ───────────────────────────────────────────────

const STATUS_STYLES: Record<FileStatus, string> = {
  DRAFT: "bg-slate-700 text-slate-300",
  IN_REVIEW: "bg-amber-500/20 text-amber-400",
  APPROVED: "bg-emerald-500/20 text-emerald-400",
  CHANGES_REQUIRED: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<FileStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  CHANGES_REQUIRED: "Changes",
};

// ── category icon ──────────────────────────────────────────────

function CategoryIcon({
  category,
  className,
}: {
  category: MimeCategory;
  className?: string;
}) {
  const cls = className ?? "w-6 h-6 text-slate-400";
  switch (category) {
    case "image":
      return <FileImage className={cls} />;
    case "video":
      return <FileVideo className={cls} />;
    case "pdf":
      return <FileText className={`${cls} text-red-400`} />;
    case "doc":
      return <FileText className={`${cls} text-blue-400`} />;
    default:
      return <FileIcon className={cls} />;
  }
}

// ── props ──────────────────────────────────────────────────────

interface FileCardProps {
  file: AssetFile;
  onClick: (file: AssetFile) => void;
  view?: "grid" | "list";
}

// ── component ──────────────────────────────────────────────────

export function FileCard({ file, onClick, view = "grid" }: FileCardProps) {
  const commentCount = file._count?.comments ?? 0;
  const versionCount = file._count?.versions ?? 0;
  const context =
    file.project?.name ?? file.client?.name ?? file.task?.title ?? null;

  // ── list view ────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div
        onClick={() => onClick(file)}
        className="flex items-center gap-4 px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group"
      >
        {/* icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center">
          <CategoryIcon category={file.mimeCategory} className="w-4 h-4 text-slate-300" />
        </div>

        {/* name + context */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
            {file.name}
          </p>
          {context && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{context}</p>
          )}
        </div>

        {/* status */}
        <span
          className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[file.status]}`}
        >
          {STATUS_LABELS[file.status]}
        </span>

        {/* size */}
        <span className="flex-shrink-0 text-xs text-slate-500 w-16 text-right">
          {formatBytes(file.size)}
        </span>

        {/* comments */}
        {commentCount > 0 && (
          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500">
            <MessageSquare className="w-3 h-3" />
            {commentCount}
          </span>
        )}
      </div>
    );
  }

  // ── grid view ────────────────────────────────────────────────

  return (
    <div
      onClick={() => onClick(file)}
      className="group relative bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl overflow-hidden cursor-pointer transition-all"
    >
      {/* thumbnail area */}
      <div className="relative aspect-[4/3] bg-slate-900 flex items-center justify-center overflow-hidden">
        {file.mimeCategory === "image" && file.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <CategoryIcon
            category={file.mimeCategory}
            className="w-12 h-12 text-slate-600"
          />
        )}

        {/* hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <Eye className="w-3.5 h-3.5 text-white" />
            <span className="text-xs text-white font-medium">Open Review</span>
          </div>
        </div>

        {/* status badge overlay */}
        <div className="absolute top-2 left-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${STATUS_STYLES[file.status]}`}
          >
            {STATUS_LABELS[file.status]}
          </span>
        </div>

        {/* badges top-right */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {commentCount > 0 && (
            <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-xs text-slate-300">
              <MessageSquare className="w-3 h-3" />
              {commentCount}
            </span>
          )}
          {versionCount > 1 && (
            <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-xs text-slate-300">
              <GitBranch className="w-3 h-3" />
              v{versionCount}
            </span>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="p-3">
        <p className="text-sm font-medium text-slate-200 truncate" title={file.name}>
          {file.name}
        </p>

        {context && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{context}</p>
        )}

        {/* tags */}
        {file.fileTags && file.fileTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {file.fileTags.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400"
                style={
                  tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}
                }
              >
                {tag.name}
              </span>
            ))}
            {file.fileTags.length > 3 && (
              <span className="text-xs text-slate-500">
                +{file.fileTags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* size + date */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">{formatBytes(file.size)}</span>
          <span className="text-xs text-slate-600">{formatDate(file.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
