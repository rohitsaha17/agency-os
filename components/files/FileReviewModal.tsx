"use client";

import {
  useCallback,
  useEffect,
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
  ChevronUp,
  Download,
  MapPin,
  CheckCheck,
  Plus,
  Loader2,
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
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
  projectId,
}: FileReviewModalProps) {
  const [file, setFile] = useState<AssetFile>(initialFile);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [tab, setTab] = useState<"comments" | "versions">("comments");
  const [authorName, setAuthorName] = useState("Team Member");
  const [commentBody, setCommentBody] = useState("");
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [approvingAction, setApprovingAction] = useState<string | null>(null);

  // Annotation / timestamp state
  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);

  // Video ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    try {
      const res = await fetch(`/api/files/${file.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: commentBody,
          authorName,
          posX: pendingPin?.x ?? null,
          posY: pendingPin?.y ?? null,
          timestamp: pendingTimestamp ?? null,
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
    authorName,
    pendingPin,
    pendingTimestamp,
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

  // ── create task from comment ──────────────────────────────────

  const createTask = useCallback(
    async (commentId: string, commentBody: string) => {
      if (!projectId) {
        alert("No project associated with this file. Please link a project first.");
        return;
      }
      const title = prompt("Task title:", commentBody.slice(0, 60));
      if (!title) return;
      const res = await fetch(
        `/api/files/${file.id}/comments/${commentId}/task`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, projectId }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        alert(`Task created: "${data.taskTitle}"`);
        await loadComments();
      }
    },
    [file.id, projectId, loadComments]
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
      setPendingPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      setPinMode(false);
      textareaRef.current?.focus();
    },
    [pinMode]
  );

  // ── video timestamp comment ───────────────────────────────────

  const captureVideoTimestamp = useCallback(() => {
    if (videoRef.current) {
      setPendingTimestamp(videoRef.current.currentTime);
      textareaRef.current?.focus();
    }
  }, []);

  // ── partition comments ────────────────────────────────────────

  const openComments = comments.filter((c) => c.status === "OPEN");
  const resolvedComments = comments.filter((c) => c.status === "RESOLVED");

  // Numbered pins only for image annotation comments (have posX/posY)
  const pinnedComments = openComments.filter(
    (c) => c.posX !== null && c.posY !== null
  );

  // ── status config ─────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[file.status];

  // ── render ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4">
        {/* close */}
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* file name + context */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{file.name}</p>
          {(file.project?.name ?? file.client?.name) && (
            <p className="text-xs text-slate-500 truncate">
              {file.project?.name ?? file.client?.name}
            </p>
          )}
        </div>

        {/* status badge */}
        <span
          className={`flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusCfg.className}`}
        >
          {statusCfg.icon}
          {statusCfg.label}
        </span>

        {/* action buttons */}
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
            imageContainerRef={imageContainerRef}
            captureVideoTimestamp={captureVideoTimestamp}
          />
        </div>

        {/* ── SIDEBAR ── */}
        <aside className="flex-shrink-0 w-80 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
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
                <span className="bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-normal">
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
                <span className="text-slate-500 text-xs">({versions.length})</span>
              )}
            </button>
          </div>

          {/* tab content */}
          {tab === "comments" ? (
            <CommentsPanel
              openComments={openComments}
              resolvedComments={resolvedComments}
              resolvedExpanded={resolvedExpanded}
              setResolvedExpanded={setResolvedExpanded}
              resolveComment={resolveComment}
              createTask={createTask}
              authorName={authorName}
              setAuthorName={setAuthorName}
              commentBody={commentBody}
              setCommentBody={setCommentBody}
              onKeyDown={onTextareaKeyDown}
              submitComment={submitComment}
              sending={sending}
              textareaRef={textareaRef}
              pendingPin={pendingPin}
              pendingTimestamp={pendingTimestamp}
            />
          ) : (
            <VersionsPanel versions={versions} />
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
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
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
              <div className="w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-300 flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-black">{idx + 1}</span>
              </div>
            </div>
          ))}
        </div>

        {/* pin button */}
        <button
          onClick={() => setPinMode(!pinMode)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            pinMode
              ? "bg-yellow-400 text-black"
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {file.url ? (
          <video
            ref={videoRef}
            src={file.url}
            controls
            className="max-w-full max-h-[calc(100vh-240px)] rounded-lg"
          />
        ) : (
          <div className="w-64 h-48 bg-slate-800 rounded-lg flex items-center justify-center text-slate-600">
            No video preview
          </div>
        )}
        <button
          onClick={captureVideoTimestamp}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Comment at current time
        </button>
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

  // other
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
      <div className="text-6xl">📄</div>
      <p className="text-sm">{file.name}</p>
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
  createTask: (id: string, body: string) => void;
  authorName: string;
  setAuthorName: (v: string) => void;
  commentBody: string;
  setCommentBody: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submitComment: () => void;
  sending: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingPin: { x: number; y: number } | null;
  pendingTimestamp: number | null;
}

function CommentsPanel({
  openComments,
  resolvedComments,
  resolvedExpanded,
  setResolvedExpanded,
  resolveComment,
  createTask,
  authorName,
  setAuthorName,
  commentBody,
  setCommentBody,
  onKeyDown,
  submitComment,
  sending,
  textareaRef,
  pendingPin,
  pendingTimestamp,
}: CommentsPanelProps) {
  return (
    <>
      {/* comment list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {openComments.length === 0 && resolvedComments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-2">
            <MessageSquare className="w-8 h-8" />
            <p className="text-sm">No comments yet</p>
          </div>
        )}

        {openComments.map((comment, idx) => {
          const pinIndex = comment.posX !== null
            ? openComments
                .filter((c) => c.posX !== null)
                .indexOf(comment) + 1
            : null;

          return (
            <CommentRow
              key={comment.id}
              comment={comment}
              pinIndex={pinIndex}
              commentIndex={idx + 1}
              onResolve={() => resolveComment(comment.id, "RESOLVED")}
              onCreateTask={() => createTask(comment.id, comment.body)}
            />
          );
        })}

        {/* resolved section */}
        {resolvedComments.length > 0 && (
          <div>
            <button
              onClick={() => setResolvedExpanded(!resolvedExpanded)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full py-1"
            >
              {resolvedExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              {resolvedComments.length} resolved
            </button>
            {resolvedExpanded && (
              <div className="space-y-2 mt-1">
                {resolvedComments.map((comment, idx) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    pinIndex={null}
                    commentIndex={openComments.length + idx + 1}
                    resolved
                    onReopen={() => resolveComment(comment.id, "OPEN")}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="flex-shrink-0 border-t border-slate-800 p-3 space-y-2">
        {/* pending annotation indicator */}
        {(pendingPin || pendingTimestamp !== null) && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-2.5 py-1.5">
            <MapPin className="w-3 h-3" />
            {pendingPin
              ? `Pinned at ${pendingPin.x.toFixed(1)}%, ${pendingPin.y.toFixed(1)}%`
              : `Timestamp: ${formatSeconds(pendingTimestamp!)}`}
          </div>
        )}

        {/* author name */}
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your name"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />

        {/* body */}
        <textarea
          ref={textareaRef}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a comment... (⌘+Enter to send)"
          rows={3}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500"
        />

        <button
          onClick={submitComment}
          disabled={!commentBody.trim() || sending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send
        </button>
      </div>
    </>
  );
}

// ── CommentRow ─────────────────────────────────────────────────

interface CommentRowProps {
  comment: FileComment;
  pinIndex: number | null;
  commentIndex: number;
  resolved?: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
  onCreateTask?: () => void;
}

function CommentRow({
  comment,
  pinIndex,
  resolved = false,
  onResolve,
  onReopen,
  onCreateTask,
}: CommentRowProps) {
  const name = comment.author?.name ?? comment.authorName;

  return (
    <div
      className={`rounded-lg p-3 space-y-2 ${
        resolved ? "bg-slate-800/30 opacity-60" : "bg-slate-800"
      }`}
    >
      {/* header */}
      <div className="flex items-start gap-2">
        {/* avatar */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs font-medium text-indigo-300">
          {initials(name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {pinIndex !== null && (
              <span className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
                {pinIndex}
              </span>
            )}
            <span className="text-xs font-medium text-slate-300 truncate">{name}</span>
            <span className="text-xs text-slate-600 ml-auto flex-shrink-0">
              {formatTime(comment.createdAt)}
            </span>
          </div>

          {/* position/timestamp info */}
          {comment.posX !== null && (
            <p className="text-xs text-slate-600 mt-0.5">
              <MapPin className="w-2.5 h-2.5 inline mr-0.5" />
              {comment.posX.toFixed(1)}%, {comment.posY?.toFixed(1)}%
            </p>
          )}
          {comment.timestamp !== null && (
            <p className="text-xs text-slate-600 mt-0.5">
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />
              {formatSeconds(comment.timestamp!)}
            </p>
          )}
        </div>
      </div>

      {/* body */}
      <p
        className={`text-sm text-slate-300 leading-relaxed pl-9 ${
          resolved ? "line-through text-slate-500" : ""
        }`}
      >
        {comment.body}
      </p>

      {/* linked task */}
      {comment.task && (
        <div className="pl-9 flex items-center gap-1 text-xs text-indigo-400">
          <CheckCheck className="w-3 h-3" />
          Task: {comment.task.title}
        </div>
      )}

      {/* actions */}
      {!resolved && (
        <div className="pl-9 flex items-center gap-2">
          <button
            onClick={onResolve}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 transition-colors"
          >
            <CheckCircle className="w-3 h-3" />
            Resolve
          </button>
          {!comment.task && onCreateTask && (
            <button
              onClick={onCreateTask}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Task
            </button>
          )}
        </div>
      )}

      {resolved && onReopen && (
        <div className="pl-9">
          <button
            onClick={onReopen}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            Reopen
          </button>
        </div>
      )}
    </div>
  );
}

// ── VersionsPanel ──────────────────────────────────────────────

function VersionsPanel({ versions }: { versions: FileVersion[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {versions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-2">
          <GitBranch className="w-8 h-8" />
          <p className="text-sm">No versions yet</p>
        </div>
      )}
      {versions.map((v) => (
        <div key={v.id} className="bg-slate-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">
              v{v.version}
            </span>
            <span className="text-xs text-slate-500">{formatDate(v.createdAt)}</span>
          </div>
          {v.notes && (
            <p className="text-xs text-slate-400">{v.notes}</p>
          )}
          <p className="text-xs text-slate-600">{formatBytes(v.size)}</p>
        </div>
      ))}
    </div>
  );
}
