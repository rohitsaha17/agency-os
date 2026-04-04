"use client";

import { useState, useEffect, useRef } from "react";
import { Send, TrendingUp, AlertTriangle, StickyNote, CheckCircle2 } from "lucide-react";
import type { Comment } from "@/types";

// Update types shown as different visual styles
const UPDATE_TYPES = [
  { id: "progress", label: "Progress", icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-500" },
  { id: "note",     label: "Note",     icon: StickyNote,  color: "text-amber-600",  bg: "bg-amber-50 border-amber-200",  dot: "bg-amber-400"  },
  { id: "blocker",  label: "Blocker",  icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200",      dot: "bg-red-500"    },
  { id: "done",     label: "Done",     icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
] as const;
type UpdateType = typeof UPDATE_TYPES[number]["id"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// Detect what type of update from the stored body (prefix hack until we have a proper db field)
// Format: "[progress] actual message"
function parseUpdateBody(body: string): { type: UpdateType; text: string } {
  const match = body.match(/^\[(\w+)\] ([\s\S]+)$/);
  if (match) {
    const t = match[1] as UpdateType;
    if (UPDATE_TYPES.some((u) => u.id === t)) return { type: t, text: match[2] };
  }
  return { type: "note", text: body };
}

interface TaskUpdatesProps {
  taskId: string;
}

export function TaskUpdates({ taskId }: TaskUpdatesProps) {
  const [updates, setUpdates] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [updateType, setUpdateType] = useState<UpdateType>("progress");
  const [authorName, setAuthorName] = useState("You");
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/comments?type=UPDATE`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setUpdates(data); })
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [updates]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `[${updateType}] ${body.trim()}`,
          authorName,
          type: "UPDATE",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUpdates((prev) => [...prev, data]);
        setBody("");
      }
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 pt-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pb-4 border-l border-gray-100 pl-4">
              <div className="h-3 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No updates yet</p>
            <p className="text-xs text-gray-400 mt-1">Log progress, blockers, or notes below</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
            <div className="space-y-4">
              {updates.map((update) => {
                const { type, text } = parseUpdateBody(update.body);
                const meta = UPDATE_TYPES.find((u) => u.id === type) ?? UPDATE_TYPES[1];
                const Icon = meta.icon;
                return (
                  <div key={update.id} className="flex gap-3 group">
                    {/* Timeline dot */}
                    <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-1 z-10 ${meta.dot} ring-2 ring-white`} />
                    <div className="flex-1 min-w-0 pb-1">
                      <div className={`rounded-lg border px-3 py-2.5 ${meta.bg}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={`w-3 h-3 flex-shrink-0 ${meta.color}`} />
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0" title={fullDate(update.createdAt)}>
                            {timeAgo(update.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug">{text}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 px-1">
                        <div className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[8px] font-bold flex items-center justify-center flex-shrink-0">
                          {initials(update.authorName)}
                        </div>
                        <span className="text-[10px] text-gray-400">{update.authorName}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* Post update form */}
      <form onSubmit={handlePost} className="mt-4 pt-3 border-t border-gray-100 space-y-2.5 flex-shrink-0">
        {/* Type selector */}
        <div className="flex gap-1.5 flex-wrap">
          {UPDATE_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setUpdateType(t.id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all ${
                  updateType === t.id
                    ? `${t.bg} ${t.color} shadow-sm`
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Author + text */}
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your name"
          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-600"
        />
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost(e); }}
            rows={2}
            placeholder={
              updateType === "progress" ? "What progress was made?" :
              updateType === "blocker"  ? "What's blocking this task?" :
              updateType === "done"     ? "Anything to note about completion?" :
              "Add a note…"
            }
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            type="submit"
            disabled={!body.trim() || posting}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400">⌘+Enter to post</p>
      </form>
    </div>
  );
}
