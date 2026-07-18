"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  GitBranch,
  Send,
  ChevronDown,
  Download,
  MapPin,
  Check,
  Loader2,
  Play,
  MessageCircle,
  FileText,
  Upload,
  Trash2,
} from "lucide-react";
import type { AssetFile, FileComment, FileStatus, FileVersion } from "@/types";

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

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(iso);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// Deterministic color from name string
const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── role badge helper ─────────────────────────────────────────

function roleBadge(role: string | undefined | null): {
  label: string;
  className: string;
} {
  switch (role?.toUpperCase()) {
    case "ADMIN":
      return { label: "Admin", className: "bg-violet-500/20 text-violet-400" };
    case "MANAGER":
      return { label: "Manager", className: "bg-sky-500/20 text-sky-400" };
    default:
      return { label: "Member", className: "bg-slate-700 text-slate-400" };
  }
}

// ── status config ──────────────────────────────────────────────

const STATUS_CONFIG: Record<
  FileStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-slate-700 text-slate-300",
    icon: <Clock className="w-3 h-3" />,
  },
  IN_REVIEW: {
    label: "In Review",
    className: "bg-amber-500/20 text-amber-400",
    icon: <Clock className="w-3 h-3" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-500/20 text-emerald-400",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  CHANGES_REQUIRED: {
    label: "Changes Required",
    className: "bg-red-500/20 text-red-400",
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

// ── props ──────────────────────────────────────────────────────

interface FileReviewModalProps {
  file: AssetFile;
  onClose: () => void;
  onUpdated?: () => void;
  projectId?: string;
}

// ── main component ─────────────────────────────────────────────

export function FileReviewModal({
  file: initialFile,
  onClose,
  onUpdated,
}: FileReviewModalProps) {
  const [file, setFile] = useState<AssetFile>(initialFile);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [tab, setTab] = useState<"comments" | "versions">("comments");
  const [commentBody, setCommentBody] = useState("");
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [approvingAction, setApprovingAction] = useState<string | null>(null);

  // Annotation / timestamp state
  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [attachTimestamp, setAttachTimestamp] = useState(
    initialFile.mimeCategory === "video"
  );

  // Video ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isVideo = file.mimeCategory === "video";

  // ── load comments + versions ─────────────────────────────────

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/files/${file.id}/comments`);
      if (res.ok) setComments(await res.json());
    } catch {
      // silently ignore
    }
  }, [file.id]);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/files/${file.id}/versions`);
      if (res.ok) setVersions(await res.json());
    } catch {
      // silently ignore
    }
  }, [file.id]);

  useEffect(() => {
    loadComments();
    loadVersions();
  }, [loadComments, loadVersions]);

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── submit comment ────────────────────────────────────────────

  const submitComment = useCallback(async () => {
    if (!commentBody.trim()) return;
    setSending(true);

    let ts: number | null = null;
    if (attachTimestamp && isVideo && videoRef.current) {
      ts = pendingTimestamp ?? videoRef.current.currentTime;
    } else if (pendingTimestamp !== null && attachTimestamp) {
      ts = pendingTimestamp;
    }

    try {
      const res = await fetch(`/api/files/${file.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: commentBody,
          posX: pendingPin?.x ?? null,
          posY: pendingPin?.y ?? null,
          timestamp: ts,
        }),
      });
      if (res.ok) {
        setCommentBody("");
        setPendingPin(null);
        setPendingTimestamp(null);
        setPinMode(false);
        await loadComments();
      }
    } finally {
      setSending(false);
    }
  }, [
    commentBody,
    file.id,
    pendingPin,
    pendingTimestamp,
    attachTimestamp,
    isVideo,
    loadComments,
  ]);

  // cmd/ctrl+enter to submit
  const onTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitComment();
      }
    },
    [submitComment]
  );

  // ── resolve / toggle comment ──────────────────────────────────

  const resolveComment = useCallback(
    async (commentId: string, status: "OPEN" | "RESOLVED") => {
      const res = await fetch(`/api/files/${file.id}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await loadComments();
    },
    [file.id, loadComments]
  );

  // ── approve actions ───────────────────────────────────────────

  const approveAction = useCallback(
    async (action: "approve" | "request_changes" | "submit_review") => {
      setApprovingAction(action);
      try {
        const res = await fetch(`/api/files/${file.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          const updated = await res.json();
          setFile((prev) => ({ ...prev, status: updated.status }));
          onUpdated?.();
        }
      } finally {
        setApprovingAction(null);
      }
    },
    [file.id, onUpdated]
  );

  // ── image annotation click ────────────────────────────────────

  const onImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pinMode) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPendingPin({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      });
      setPinMode(false);
      textareaRef.current?.focus();
    },
    [pinMode]
  );

  // ── video timestamp comment ───────────────────────────────────

  const captureVideoTimestamp = useCallback(() => {
    if (videoRef.current) {
      setPendingTimestamp(videoRef.current.currentTime);
      setAttachTimestamp(true);
      textareaRef.current?.focus();
    }
  }, []);

  // ── partition comments ────────────────────────────────────────

  const openComments = useMemo(
    () => comments.filter((c) => c.status === "OPEN"),
    [comments]
  );
  const resolvedComments = useMemo(
    () => comments.filter((c) => c.status === "RESOLVED"),
    [comments]
  );

  // Numbered pins for image annotation comments
  const pinnedComments = useMemo(
    () => openComments.filter((c) => c.posX !== null && c.posY !== null),
    [openComments]
  );

  const statusCfg = STATUS_CONFIG[file.status];

  // ── seekTo handler for timestamp pills ────────────────────────

  const seekTo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // ── render ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-3">
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {file.name}
          </p>
          {(file.project?.name || file.client?.name) && (
            <p className="text-xs text-slate-500 truncate">
              {[file.project?.name, file.client?.name]
                .filter(Boolean)
                .join(" / ")}
            </p>
          )}
        </div>

        <span
          className={`flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusCfg.className}`}
        >
          {statusCfg.icon}
          {statusCfg.label}
        </span>

        <div className="flex-shrink-0 flex items-center gap-2">
          {file.status === "DRAFT" && (
            <button
              onClick={() => approveAction("submit_review")}
              disabled={approvingAction !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-black rounded-lg transition-colors disabled:opacity-50"
            >
              {approvingAction === "submit_review" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Clock className="w-3 h-3" />
              )}
              Submit for Review
            </button>
          )}
          {file.status === "IN_REVIEW" && (
            <>
              <button
                onClick={() => approveAction("request_changes")}
                disabled={approvingAction !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {approvingAction === "request_changes" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
                Request Changes
              </button>
              <button
                onClick={() => approveAction("approve")}
                disabled={approvingAction !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg transition-colors disabled:opacity-50"
              >
                {approvingAction === "approve" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
                Approve
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── PREVIEW AREA ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <PreviewArea
            file={file}
            pinnedComments={pinnedComments}
            pinMode={pinMode}
            setPinMode={setPinMode}
            onImageClick={onImageClick}
            videoRef={videoRef}
            captureVideoTimestamp={captureVideoTimestamp}
          />
        </div>

        {/* ── SIDEBAR ── */}
        <aside className="flex-shrink-0 w-[360px] bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
          {/* tabs */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setTab("comments")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                tab === "comments"
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Comments
              {openComments.length > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-medium px-1">
                  {openComments.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("versions")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                tab === "versions"
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Versions
              {versions.length > 0 && (
                <span className="text-slate-500 text-xs">
                  ({versions.length})
                </span>
              )}
            </button>
          </div>

          {tab === "comments" ? (
            <CommentsPanel
              openComments={openComments}
              resolvedComments={resolvedComments}
              resolvedExpanded={resolvedExpanded}
              setResolvedExpanded={setResolvedExpanded}
              resolveComment={resolveComment}
              commentBody={commentBody}
              setCommentBody={setCommentBody}
              onKeyDown={onTextareaKeyDown}
              submitComment={submitComment}
              sending={sending}
              textareaRef={textareaRef}
              pendingPin={pendingPin}
              pendingTimestamp={pendingTimestamp}
              attachTimestamp={attachTimestamp}
              setAttachTimestamp={setAttachTimestamp}
              isVideo={isVideo}
              seekTo={seekTo}
            />
          ) : (
            <VersionsPanel
              versions={versions}
              fileId={file.id}
              onVersionCreated={() => { loadVersions(); onUpdated?.(); }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── PreviewArea ────────────────────────────────────────────────

interface PreviewAreaProps {
  file: AssetFile;
  pinnedComments: FileComment[];
  pinMode: boolean;
  setPinMode: (v: boolean) => void;
  onImageClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  captureVideoTimestamp: () => void;
}

function PreviewArea({
  file,
  pinnedComments,
  pinMode,
  setPinMode,
  onImageClick,
  videoRef,
  captureVideoTimestamp,
}: PreviewAreaProps) {
  if (file.mimeCategory === "image") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-6 gap-4">
        <div
          onClick={onImageClick}
          className={`relative max-w-full max-h-[calc(100vh-200px)] select-none ${
            pinMode ? "cursor-crosshair" : "cursor-default"
          }`}
        >
          {file.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name}
              className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg"
              draggable={false}
            />
          ) : (
            <div className="w-64 h-48 bg-slate-800 rounded-lg flex items-center justify-center text-slate-600">
              No preview
            </div>
          )}

          {/* annotation pins */}
          {pinnedComments.map((c, idx) => (
            <div
              key={c.id}
              className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${c.posX}%`,
                top: `${c.posY}%`,
              }}
            >
              <div className="w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-300 flex items-center justify-center shadow-lg shadow-yellow-400/20">
                <span className="text-[10px] font-bold text-black">
                  {idx + 1}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPinMode(!pinMode)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            pinMode
              ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/20"
              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
          }`}
        >
          <MapPin className="w-4 h-4" />
          {pinMode ? "Click image to place pin" : "Pin Comment"}
        </button>
      </div>
    );
  }

  if (file.mimeCategory === "video") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {file.url ? (
          <div className="relative group">
            <video
              ref={videoRef}
              src={file.url}
              controls
              className="max-w-full max-h-[calc(100vh-200px)] rounded-lg"
            />
            {/* Floating comment button overlay */}
            <button
              onClick={captureVideoTimestamp}
              className="absolute bottom-16 right-4 flex items-center gap-1.5 px-3 py-2 bg-indigo-600/90 hover:bg-indigo-600 backdrop-blur-sm text-white rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100 shadow-lg"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Comment here
            </button>
          </div>
        ) : (
          <div className="w-64 h-48 bg-slate-800 rounded-lg flex items-center justify-center text-slate-600">
            No video preview
          </div>
        )}
      </div>
    );
  }

  if (file.mimeCategory === "pdf") {
    return (
      <div className="flex-1 overflow-hidden">
        {file.url ? (
          <iframe
            src={file.url}
            className="w-full h-full border-0"
            title={file.name}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600">
            No PDF preview available
          </div>
        )}
      </div>
    );
  }

  // fallback for other file types
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
        <FileText className="w-10 h-10 text-slate-600" />
      </div>
      <p className="text-sm font-medium text-slate-300">{file.name}</p>
      <p className="text-xs text-slate-600">{file.mimeType}</p>
      {file.url && (
        <a
          href={file.url}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download File
        </a>
      )}
    </div>
  );
}

// ── CommentsPanel ──────────────────────────────────────────────

interface CommentsPanelProps {
  openComments: FileComment[];
  resolvedComments: FileComment[];
  resolvedExpanded: boolean;
  setResolvedExpanded: (v: boolean) => void;
  resolveComment: (id: string, status: "OPEN" | "RESOLVED") => void;
  commentBody: string;
  setCommentBody: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submitComment: () => void;
  sending: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingPin: { x: number; y: number } | null;
  pendingTimestamp: number | null;
  attachTimestamp: boolean;
  setAttachTimestamp: (v: boolean) => void;
  isVideo: boolean;
  seekTo: (seconds: number) => void;
}

function CommentsPanel({
  openComments,
  resolvedComments,
  resolvedExpanded,
  setResolvedExpanded,
  resolveComment,
  commentBody,
  setCommentBody,
  onKeyDown,
  submitComment,
  sending,
  textareaRef,
  pendingPin,
  pendingTimestamp,
  attachTimestamp,
  setAttachTimestamp,
  isVideo,
  seekTo,
}: CommentsPanelProps) {
  return (
    <>
      {/* comment list */}
      <div className="flex-1 overflow-y-auto">
        {openComments.length === 0 && resolvedComments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">No comments yet</p>
            <p className="text-xs text-slate-700">
              Start the conversation below
            </p>
          </div>
        )}

        {/* open comments */}
        <div className="divide-y divide-slate-800/50">
          {openComments.map((comment) => {
            const pinIndex =
              comment.posX !== null
                ? openComments
                    .filter((c) => c.posX !== null)
                    .indexOf(comment) + 1
                : null;

            return (
              <CommentThread
                key={comment.id}
                comment={comment}
                pinIndex={pinIndex}
                onResolve={() => resolveComment(comment.id, "RESOLVED")}
                seekTo={seekTo}
              />
            );
          })}
        </div>

        {/* resolved section */}
        {resolvedComments.length > 0 && (
          <div className="border-t border-slate-800">
            <button
              onClick={() => setResolvedExpanded(!resolvedExpanded)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full px-4 py-3"
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform ${
                  resolvedExpanded ? "rotate-180" : ""
                }`}
              />
              {resolvedComments.length} resolved comment
              {resolvedComments.length !== 1 ? "s" : ""}
            </button>
            {resolvedExpanded && (
              <div className="divide-y divide-slate-800/30">
                {resolvedComments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    pinIndex={null}
                    resolved
                    onReopen={() => resolveComment(comment.id, "OPEN")}
                    seekTo={seekTo}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900">
        {/* pending annotation indicator */}
        {(pendingPin || pendingTimestamp !== null) && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 bg-slate-800 border border-slate-700">
              {pendingPin ? (
                <>
                  <MapPin className="w-3 h-3 text-yellow-400" />
                  <span className="text-yellow-400">
                    Pin at {pendingPin.x.toFixed(1)}%,{" "}
                    {pendingPin.y.toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-indigo-400" />
                  <span className="text-indigo-400">
                    {formatSeconds(pendingTimestamp!)}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* video timestamp checkbox */}
        {isVideo && (
          <div className="px-4 pt-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  attachTimestamp
                    ? "bg-indigo-500 border-indigo-500"
                    : "border-slate-600 group-hover:border-slate-500"
                }`}
                onClick={() => setAttachTimestamp(!attachTimestamp)}
              >
                {attachTimestamp && <Check className="w-3 h-3 text-white" />}
              </div>
              <span
                className="text-xs text-slate-400"
                onClick={() => setAttachTimestamp(!attachTimestamp)}
              >
                Attach current timestamp
              </span>
            </label>
          </div>
        )}

        <div className="p-4 pt-3">
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl focus-within:border-indigo-500/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Write a comment..."
              rows={2}
              className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none"
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[10px] text-slate-600">
                {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to
                send
              </span>
              <button
                onClick={submitComment}
                disabled={!commentBody.trim() || sending}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-colors"
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── CommentThread (Frame.io style) ────────────────────────────

interface CommentThreadProps {
  comment: FileComment;
  pinIndex: number | null;
  resolved?: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
  seekTo: (seconds: number) => void;
}

function CommentThread({
  comment,
  pinIndex,
  resolved = false,
  onResolve,
  onReopen,
  seekTo,
}: CommentThreadProps) {
  const [hovered, setHovered] = useState(false);
  const name = comment.author?.name ?? comment.authorName;
  const role = (comment as { author?: { role?: string } })?.author?.role ?? undefined;
  const badge = roleBadge(role);

  return (
    <div
      className={`relative px-4 py-3 transition-colors ${
        resolved
          ? "opacity-50"
          : "hover:bg-slate-800/30"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex gap-3">
        {/* avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarColor(name)} flex items-center justify-center`}
        >
          <span className="text-[11px] font-semibold text-white">
            {getInitials(name)}
          </span>
        </div>

        {/* content */}
        <div className="flex-1 min-w-0">
          {/* header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-semibold ${
                resolved ? "text-slate-500" : "text-slate-200"
              }`}
            >
              {name}
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="text-[11px] text-slate-600">
              {relativeTime(comment.createdAt)}
            </span>
          </div>

          {/* timestamp pill (video) */}
          {comment.timestamp !== null && (
            <button
              onClick={() => seekTo(comment.timestamp!)}
              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-xs font-medium hover:bg-indigo-500/25 transition-colors"
            >
              <Play className="w-2.5 h-2.5 fill-current" />
              {formatSeconds(comment.timestamp!)}
            </button>
          )}

          {/* pin badge (image annotation) */}
          {pinIndex !== null && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 text-xs font-medium">
              <MapPin className="w-2.5 h-2.5" />
              Pin #{pinIndex}
            </span>
          )}

          {/* comment body */}
          <p
            className={`text-[13px] leading-relaxed mt-1.5 ${
              resolved
                ? "line-through text-slate-600"
                : "text-slate-300"
            }`}
          >
            {comment.body}
          </p>

          {/* replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-3 space-y-3 pl-2 border-l-2 border-slate-800">
              {comment.replies.map((reply) => {
                const replyName =
                  reply.author?.name ?? reply.authorName;
                const replyRole = (reply as { author?: { role?: string } })?.author?.role ?? undefined;
                const replyBadge = roleBadge(replyRole);

                return (
                  <div key={reply.id} className="flex gap-2">
                    <div
                      className={`flex-shrink-0 w-6 h-6 rounded-full ${avatarColor(replyName)} flex items-center justify-center`}
                    >
                      <span className="text-[9px] font-semibold text-white">
                        {getInitials(replyName)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-300">
                          {replyName}
                        </span>
                        <span
                          className={`text-[9px] font-medium px-1 py-px rounded-full ${replyBadge.className}`}
                        >
                          {replyBadge.label}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {relativeTime(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        {reply.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* reopen link for resolved */}
          {resolved && onReopen && (
            <button
              onClick={onReopen}
              className="mt-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              Reopen
            </button>
          )}
        </div>

        {/* resolve checkmark on hover */}
        {!resolved && onResolve && hovered && (
          <button
            onClick={onResolve}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
            title="Resolve"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── VersionsPanel ──────────────────────────────────────────────

function VersionsPanel({
  versions,
  fileId,
  onVersionCreated,
}: {
  versions: FileVersion[];
  fileId: string;
  onVersionCreated: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [versionNotes, setVersionNotes] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadVersion = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (versionNotes.trim()) fd.append("notes", versionNotes.trim());
      const res = await fetch(`/api/files/${fileId}/versions`, { method: "POST", body: fd });
      if (res.ok) {
        setVersionNotes("");
        setShowUpload(false);
        onVersionCreated();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!window.confirm("Delete this version? This cannot be undone.")) return;
    setDeleting(versionId);
    try {
      const res = await fetch(`/api/files/${fileId}/versions?versionId=${versionId}`, { method: "DELETE" });
      if (res.ok) onVersionCreated();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Upload new version */}
      <div className="p-3 border-b border-slate-800">
        {!showUpload ? (
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Upload New Version
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Version notes (optional)"
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadVersion(f);
              }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {uploading ? "Uploading..." : "Choose File"}
              </button>
              <button
                onClick={() => { setShowUpload(false); setVersionNotes(""); }}
                className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {versions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
              <GitBranch className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">No versions yet</p>
          </div>
        )}
        {versions.map((v, i) => (
          <div
            key={v.id}
            className="group bg-slate-800/60 hover:bg-slate-800 rounded-xl p-3.5 space-y-1 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                v{v.version}
                {i === 0 && <span className="ml-1.5 text-[10px] text-emerald-400 font-normal">(latest)</span>}
              </span>
              <div className="flex items-center gap-1">
                {v.url && (
                  <a
                    href={v.url}
                    download
                    className="p-1 text-slate-500 hover:text-slate-200 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Download this version"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                )}
                {versions.length > 1 && (
                  <button
                    onClick={() => handleDeleteVersion(v.id)}
                    disabled={deleting === v.id}
                    className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete this version"
                  >
                    {deleting === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
                <span className="text-[11px] text-slate-500">
                  {formatDate(v.createdAt)}
                </span>
              </div>
            </div>
            {v.notes && (
              <p className="text-xs text-slate-400 leading-relaxed">
                {v.notes}
              </p>
            )}
            <p className="text-[11px] text-slate-600">{formatBytes(v.size)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
