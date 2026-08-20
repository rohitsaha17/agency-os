"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Select } from "@/components/ui/Select";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const isDigest = (t: string) => t.startsWith("DIGEST_");

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "digests">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100");
      const d = await res.json();
      if (res.ok) {
        setItems(d.notifications ?? []);
        setUnread(d.unreadCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const markAllRead = async () => {
    setItems((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  };

  const markRead = async (n: NotificationRow) => {
    if (n.readAt) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
  };

  const types = [...new Set(items.map((n) => n.type))].sort();
  const visible = items.filter((n) => {
    if (tab === "digests" && !isDigest(n.type)) return false;
    if (typeFilter && n.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-0.5">{unread} unread</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              options={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: t, label: `${t.replace(/_/g, " ").toLowerCase()}` }))]}
              size="sm"
            />
            {unread > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-4 -mb-[21px]">
          {(["all", "digests"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${
                tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="space-y-2 max-w-2xl">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bell className="w-12 h-12 text-gray-200 mb-4" />
            <p className="text-sm text-gray-500">Nothing here yet.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-1.5">
            {visible.map((n) => {
              const digest = isDigest(n.type);
              const open = expanded.has(n.id);
              return (
                <div key={n.id}
                  className={`bg-white border rounded-xl px-4 py-3 ${n.readAt ? "border-gray-100 opacity-70" : "border-indigo-100"}`}>
                  <div className="flex items-start gap-3">
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          {n.type.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                      {n.body && !digest && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      {digest && open && n.body && (
                        <ul className="mt-2 space-y-1">
                          {n.body.split("\n").map((line, i) => (
                            <li key={i} className="text-xs text-gray-600 border-l-2 border-indigo-100 pl-2">{line}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                        {n.link && (
                          <Link href={n.link} onClick={() => markRead(n)}
                            className="text-[11px] font-medium text-indigo-600 hover:underline">
                            Open →
                          </Link>
                        )}
                        {digest && n.body && (
                          <button
                            onClick={() => setExpanded((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })}
                            className="text-[11px] text-gray-500 hover:text-gray-700 inline-flex items-center gap-0.5">
                            {open ? <>Collapse <ChevronUp className="w-3 h-3" /></> : <>Expand <ChevronDown className="w-3 h-3" /></>}
                          </button>
                        )}
                        {!n.readAt && (
                          <button onClick={() => markRead(n)} className="text-[11px] text-gray-400 hover:text-gray-600 ml-auto">
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
