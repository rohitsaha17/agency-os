"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, X, Send, Sparkles, Loader2,
  ExternalLink, Search, Plus, Minimize2,
  Maximize2,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: { type: "navigate" | "create" | "search"; label: string; data: any }[];
  dataCards?: { type: "stat" | "list" | "table"; title: string; data: any }[];
  timestamp: Date;
}

const SUGGESTIONS = [
  "How many active projects do we have?",
  "Show me overdue tasks",
  "What's our expense total this month?",
  "Which clients need attention?",
  "Summarize project health",
];

const STORAGE_KEY = "agency-ai-chat-history";
const MAX_STORED_MESSAGES = 50;
const REQUEST_TIMEOUT_MS = 30_000;

/* ─────────────────────────────────────────────────────────────
   Safe markdown rendering.
   We build React nodes directly and never use dangerouslySetInnerHTML,
   so any raw HTML in the model's output is rendered as literal text.
   Supported: **bold**, *italic*, `code`, line breaks, and [label](url)
   links (links are restricted to http(s)/mailto schemes).
   ───────────────────────────────────────────────────────────── */

const INLINE_PATTERN =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  // Allow http/https/mailto; block javascript:, data:, vbscript:, etc.
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed);
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  // Reset regex state for each call
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const key = `${keyPrefix}-${k++}`;
    if (match[1]) {
      nodes.push(<strong key={key} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={key}>{match[4]}</em>);
    } else if (match[5]) {
      nodes.push(
        <code key={key} className="bg-gray-100 px-1 rounded text-xs font-mono">
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      const label = match[8];
      const href = match[9];
      if (isSafeUrl(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline hover:text-indigo-700"
          >
            {label}
          </a>
        );
      } else {
        // Unsafe URL — render as plain text
        nodes.push(`${label} (${href})`);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Bullet list
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
          const text = line.trim().slice(2);
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
              <span className="text-sm">{renderInline(text, `b-${i}`)}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = line.trim().match(/^(\d+)\.\s(.+)/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-xs text-gray-400 font-medium mt-0.5 flex-shrink-0 w-4">
                {numMatch[1]}.
              </span>
              <span className="text-sm">{renderInline(numMatch[2], `n-${i}`)}</span>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm">
            {renderInline(line, `p-${i}`)}
          </p>
        );
      })}
    </div>
  );
}

function DataCard({ card }: { card: NonNullable<ChatMessage["dataCards"]>[0] }) {
  if (card.type === "stat") {
    return (
      <div className="grid grid-cols-2 gap-2 mt-2">
        {(Array.isArray(card.data) ? card.data : [card.data]).map((item: any, i: number) => (
          <div key={i} className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-lg font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    );
  }

  if (card.type === "list") {
    return (
      <div className="mt-2 bg-white/80 rounded-lg border border-gray-100 overflow-hidden">
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-600">{card.title}</p>
        </div>
        <ul className="divide-y divide-gray-50">
          {(card.data as any[]).slice(0, 5).map((item: any, i: number) => (
            <li key={i} className="px-3 py-2 text-xs text-gray-700 flex items-center justify-between">
              <span className="truncate">{item.label || item.title || item.name || String(item)}</span>
              {item.value && <span className="text-gray-500 flex-shrink-0 ml-2">{item.value}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (card.type === "table") {
    const rows = card.data as any[];
    if (!rows.length) return null;
    const cols = Object.keys(rows[0]);
    return (
      <div className="mt-2 bg-white/80 rounded-lg border border-gray-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {cols.map((c) => (
                <th key={c} className="px-2.5 py-1.5 text-left font-semibold text-gray-500 uppercase tracking-wide">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.slice(0, 8).map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className="px-2.5 py-1.5 text-gray-700">{String(row[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

function ActionButton({ action }: { action: NonNullable<ChatMessage["actions"]>[0] }) {
  const handleClick = () => {
    if (action.type === "navigate" && action.data?.href) {
      window.location.href = action.data.href;
    }
  };

  const icon =
    action.type === "navigate" ? <ExternalLink className="w-3 h-3" /> :
    action.type === "create" ? <Plus className="w-3 h-3" /> :
    <Search className="w-3 h-3" />;

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100"
    >
      {icon} {action.label}
    </button>
  );
}

export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted conversation on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          const restored = parsed.map((m) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          }));
          if (restored.length) {
            setMessages(restored);
            setShowSuggestions(false);
          }
        }
      }
    } catch {
      // Corrupt storage — ignore and start fresh
    }
    setHydrated(true);
  }, []);

  // Persist conversation (latest 50) whenever it changes
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      const trimmed = messages.slice(-MAX_STORED_MESSAGES);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [messages, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          conversationHistory,
          context: {
            currentPage: window.location.pathname,
          },
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Too many requests. Please wait a moment.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (res.status >= 500) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Something went wrong. Please try again.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I couldn't process that request.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: typeof data.response === "string" ? data.response : "",
        actions: data.actions,
        dataCards: data.dataCards,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isAbort
            ? "Request timed out. Please try again."
            : "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 transition-all flex items-center justify-center group"
        title="AI Assistant"
      >
        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 bg-white rounded-2xl shadow-2xl shadow-gray-900/20 border border-gray-200 flex flex-col overflow-hidden transition-all duration-300 ${
        isExpanded
          ? "bottom-4 right-4 left-4 top-20 lg:top-4 sm:left-auto sm:w-[640px] sm:top-16"
          : "bottom-20 right-4 lg:bottom-6 lg:right-6 w-[calc(100vw-2rem)] max-w-[400px] h-[560px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Agency AI Assistant</h3>
            <p className="text-xs text-white/70">Ask anything about your workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && showSuggestions && (
          <div className="space-y-3">
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-indigo-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">How can I help you today?</p>
              <p className="text-xs text-gray-400 mt-1">
                Ask about projects, tasks, clients, expenses, or search across your workspace
              </p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-50 text-gray-800 border border-gray-100"
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm">{msg.content}</p>
              ) : (
                <>
                  <MarkdownContent content={msg.content} />
                  {msg.dataCards?.map((card, j) => (
                    <DataCard key={j} card={card} />
                  ))}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-gray-200">
                      {msg.actions.map((action, j) => (
                        <ActionButton key={j} action={action} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Clear chat button */}
      {messages.length > 0 && (
        <div className="px-4 py-1 flex justify-center border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear conversation
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
