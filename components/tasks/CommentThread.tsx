"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Trash2, MessageSquare } from "lucide-react";
import type { Comment } from "@/types";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return <img src={url} alt={name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
      {initials(name)}
    </div>
  );
}

interface CommentThreadProps {
  taskId: string;
}

export function CommentThread({ taskId }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("You");
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/comments`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setComments(data); })
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), authorName }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data]);
        setBody("");
      }
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="flex gap-2 animate-pulse">
        <div className="w-7 h-7 bg-gray-200 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-gray-200 rounded w-1/4" />
          <div className="h-3 bg-gray-200 rounded" />
        </div>
      </div>
    ))}</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No comments yet</p>
            <p className="text-xs text-gray-400">Be the first to add a note</p>
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2.5 group">
              <Avatar name={c.authorName} url={c.author?.avatarUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-800">{c.authorName}</span>
                  <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500 text-gray-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handlePost} className="mt-4 pt-3 border-t border-gray-100 space-y-2 flex-shrink-0">
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
            placeholder="Add a comment… (⌘+Enter to send)"
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
      </form>
    </div>
  );
}
