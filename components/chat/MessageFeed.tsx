"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Download, Paperclip, CheckSquare, RefreshCw, Image,
  Film, FileText, File as FileIcon,
} from "lucide-react";
import type { ChatMessage, Channel } from "@/types";

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === d.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return `Yesterday ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function dateDivider(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function AttachmentItem({ att }: { att: NonNullable<ChatMessage["attachments"]>[number] }) {
  const { file } = att;
  const isImage = file.mimeCategory === "image";
  const isVideo = file.mimeCategory === "video";

  if (isImage && file.url) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block mt-1.5 max-w-[280px]">
        <img src={file.url} alt={file.name} className="rounded-lg border border-white/[0.08] max-h-48 object-cover w-full hover:opacity-90 transition-opacity" />
        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{file.name}</p>
      </a>
    );
  }

  const Icon = isVideo ? Film :
    file.mimeCategory === "pdf" ? FileText :
    file.mimeCategory === "doc" ? FileText : FileIcon;

  return (
    <div className="flex items-center gap-2.5 mt-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 max-w-[280px]">
      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-200 truncate">{file.name}</p>
        <p className="text-[10px] text-slate-500">
          {file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`}
        </p>
      </div>
      {file.url && (
        <a href={file.url} download={file.name} className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
          <Download className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function MessageBubble({ msg, showAvatar }: { msg: ChatMessage; showAvatar: boolean }) {
  const isDeleted = !!msg.deletedAt;
  return (
    <div className={`flex gap-2.5 group px-4 py-1 hover:bg-white/[0.02] rounded-lg transition-colors ${showAvatar ? "mt-3" : "mt-0"}`}>
      {/* Avatar column */}
      <div className="w-8 flex-shrink-0 mt-0.5">
        {showAvatar ? (
          msg.author?.avatarUrl ? (
            <img src={msg.author.avatarUrl} alt={msg.authorName} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials(msg.authorName)}
            </div>
          )
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-slate-200">{msg.authorName}</span>
            <span className="text-[10px] text-slate-600">{timeLabel(msg.createdAt)}</span>
            {msg.editedAt && <span className="text-[10px] text-slate-600 italic">(edited)</span>}
          </div>
        )}
        {isDeleted ? (
          <p className="text-sm text-slate-600 italic">This message was deleted</p>
        ) : (
          <>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
            {/* Task reference */}
            {msg.task && (
              <div className="flex items-center gap-1.5 mt-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 w-fit max-w-xs">
                <CheckSquare className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                <span className="text-xs text-indigo-300 truncate">{msg.task.title}</span>
              </div>
            )}
            {/* Attachments */}
            {msg.attachments?.map((att) => <AttachmentItem key={att.id} att={att} />)}
          </>
        )}
      </div>
    </div>
  );
}

interface MessageFeedProps {
  channel: Channel;
  currentUser?: string;
}

export function MessageFeed({ channel, currentUser }: MessageFeedProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [channel.id]);

  useEffect(() => {
    setMessages([]);
    fetchMessages();
    lastFetchRef.current = channel.id;
  }, [channel.id, fetchMessages]);

  // Poll for new messages every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchMessages(true), 4000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-700 rounded w-24" />
              <div className="h-3 bg-slate-700 rounded w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Group consecutive messages by same author within 5 minutes
  const grouped: { msg: ChatMessage; showAvatar: boolean; showDivider?: string }[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const sameAuthor = prev && prev.authorId === msg.authorId && prev.authorName === msg.authorName;
    const within5min = prev && new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
    const showAvatar = !sameAuthor || !within5min;

    // Date divider
    let showDivider: string | undefined;
    if (!prev) {
      showDivider = dateDivider(msg.createdAt);
    } else {
      const prevDate = new Date(prev.createdAt).toDateString();
      const curDate  = new Date(msg.createdAt).toDateString();
      if (prevDate !== curDate) showDivider = dateDivider(msg.createdAt);
    }

    grouped.push({ msg, showAvatar, showDivider });
  });

  return (
    <div className="flex-1 overflow-y-auto min-h-0 py-2 relative">
      {/* Auto-refresh indicator */}
      {refreshing && (
        <div className="absolute top-2 right-3 z-10">
          <RefreshCw className="w-3 h-3 text-slate-600 animate-spin" />
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <span className="text-2xl">#</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">Welcome to #{channel.name}</h3>
          <p className="text-slate-500 text-sm max-w-sm">
            {channel.description || "This is the start of the conversation. Send a message to get started."}
          </p>
        </div>
      ) : (
        <>
          {grouped.map(({ msg, showAvatar, showDivider }) => (
            <div key={msg.id}>
              {showDivider && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 h-px bg-slate-700/50" />
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-900 px-2">{showDivider}</span>
                  <div className="flex-1 h-px bg-slate-700/50" />
                </div>
              )}
              <MessageBubble msg={msg} showAvatar={showAvatar} />
            </div>
          ))}
        </>
      )}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
