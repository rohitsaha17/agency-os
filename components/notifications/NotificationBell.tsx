"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { AcceptDeclineDialog } from "@/components/tasks/AcceptDeclineDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface NotificationItem {
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

/**
 * Sidebar notification bell: unread badge + dropdown listing recent
 * notifications. Polls /api/notifications on the same 60s cadence the
 * sidebar already uses for message unread counts.
 */
export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    fetch("/api/notifications?limit=15")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { notifications?: NotificationItem[]; unreadCount?: number } | null) => {
        if (!data) return;
        if (Array.isArray(data.notifications)) setItems(data.notifications);
        if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = useCallback(
    async (n: NotificationItem) => {
      if (!n.readAt) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
        try { await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }); } catch { /* ignore */ }
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try { await fetch("/api/notifications/read-all", { method: "POST" }); } catch { /* ignore */ }
  }, []);

  const { user: me } = useCurrentUser();
  const [acceptTask, setAcceptTask] = useState<{ id: string; title: string; link: string } | null>(null);

  /**
   * Open what a notification points at — but answer it first if it is asking.
   *
   * Being told "you were assigned X", landing on the task and then having to
   * find the Accept control is three steps for one decision. If the
   * assignment is still unanswered the prompt comes up here; accepting sends
   * you on to the work, declining leaves you where you were because there is
   * nothing to go and do.
   *
   * The pending check costs one request and only runs for assignment
   * notifications. Anything else, or any failure looking it up, navigates as
   * before — a slow network must not stop a notification opening.
   */
  const follow = useCallback(async (n: NotificationItem) => {
    if (!n.link) return;
    const taskId = n.link.match(/[?&]task=([^&]+)/)?.[1];

    if (n.type === "TASK_ASSIGNED" && taskId && me?.id) {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (res.ok) {
          const t = await res.json();
          const mine = (t.assignees ?? []).find(
            (a: { userId?: string; user?: { id?: string }; acceptance?: string }) =>
              (a.user?.id ?? a.userId) === me.id);
          if (mine?.acceptance === "PENDING") {
            setOpen(false);
            setAcceptTask({ id: taskId, title: t.title ?? n.title, link: n.link });
            return;
          }
        }
      } catch {
        // Fall through and just navigate.
      }
    }

    setOpen(false);
    router.push(n.link);
  }, [me?.id, router]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] flex items-center justify-center px-1 text-[10px] font-semibold leading-none text-white bg-indigo-500 rounded-full ring-2 ring-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 w-80 max-h-[420px] flex flex-col rounded-xl bg-white dark:bg-slate-800 shadow-2xl border border-gray-200 dark:border-slate-700 z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); router.push("/notifications"); }}
                className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:underline"
              >
                View all
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-500">
                Nothing here yet — you&apos;ll see task updates and mentions.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => { markRead(n); void follow(n); }}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors ${
                        n.readAt ? "opacity-70" : ""
                      }`}
                    >
                      <span className="flex items-start gap-2.5">
                        {!n.readAt && (
                          <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-gray-900 dark:text-slate-100 leading-snug">
                            {n.title}
                          </span>
                          {n.body && (
                            <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
                              {n.body}
                            </span>
                          )}
                          <span className="block text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Answer it here rather than making them find the control after
          landing on the task. */}
      {acceptTask && (
        <AcceptDeclineDialog
          open
          taskId={acceptTask.id}
          taskTitle={acceptTask.title}
          onClose={() => setAcceptTask(null)}
          onDone={(action) => {
            const link = acceptTask.link;
            setAcceptTask(null);
            if (action === "ACCEPT") router.push(link);
          }}
        />
      )}
    </div>
  );
}
