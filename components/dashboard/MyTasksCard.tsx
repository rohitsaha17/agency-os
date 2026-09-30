"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Panel, Empty } from "./kit";

type MyTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  acceptance: "PENDING" | "ACCEPTED" | "DECLINED";
};

/** Enough to be the day's work at a glance; the rest is one click away. */
const ON_DASHBOARD = 6;

/**
 * Everything assigned to you, in one place on the way in.
 *
 * The point is that nothing gets missed: a person opens the dashboard and sees
 * their own open work, with the not-yet-answered assignments called out first
 * so an Accept never sits unnoticed on a task nobody thought to open. A row is
 * the whole task — clicking it opens the task drawer, where the full detail and
 * the Accept / Not-available controls live (AcceptanceBanner), rather than
 * asking someone to decide from a title alone.
 *
 * Self-scoped: /api/tasks/mine returns only this person's assignments, so the
 * card says the same thing to a junior and to a manager — "yours", not "the
 * org's".
 */
export function MyTasksCard() {
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetch("/api/tasks/mine")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        setTasks(d.tasks ?? []);
        setPending(d.pendingCount ?? 0);
        setFailed(false);
      })
      .catch(() => { setFailed(true); setTasks([]); });
  }, []);

  useEffect(load, [load]);

  // Only while the first request is in flight — after that the card stays on
  // the page, empty state and all, so "no tasks" reads as good news rather
  // than a missing feature.
  if (!tasks) return null;

  const shown = tasks.slice(0, ON_DASHBOARD);

  return (
    <Panel
      icon={<ListChecks className="w-4.5 h-4.5" />}
      title="My Tasks"
      subtitle={
        pending > 0
          ? `${pending} waiting for you to accept`
          : tasks.length > 0
            ? `${tasks.length} on your plate`
            : "Assigned to you"
      }
      href="/tasks"
      /* Pull the eye here when something needs a yes/no. */
      accent={pending > 0}
    >
      {failed ? (
        <div className="px-4 sm:px-5 pb-4 flex items-start gap-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            Your tasks could not be loaded just now.
          </p>
          <button onClick={load} className="text-xs font-medium text-indigo-600 hover:underline flex-shrink-0">
            Try again
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <Empty>Nothing assigned to you right now. Work you&apos;re given lands here.</Empty>
      ) : (
        <>
          <ul className="pb-1">
            {shown.map((t) => (
              <li key={t.id} className="border-t border-gray-100 dark:border-white/[0.05]">
                <Link
                  href={`/tasks?task=${t.id}`}
                  className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot(t.priority)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">
                      {t.title}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">{subline(t)}</p>
                  </div>
                  {t.acceptance === "PENDING" ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex-shrink-0">
                      Accept?
                    </span>
                  ) : (
                    <DuePill iso={t.dueDate} />
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <footer className="px-4 sm:px-5 py-2.5 border-t border-gray-100 dark:border-white/[0.05] flex items-center gap-2">
            <ListChecks className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
            <p className="text-[11px] text-gray-400">
              {tasks.length > ON_DASHBOARD
                ? `Showing ${ON_DASHBOARD} of ${tasks.length}`
                : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
            </p>
          </footer>
        </>
      )}
    </Panel>
  );
}

/** A calm dot by priority — a hint, not a shout. */
function priorityDot(priority: string): string {
  switch (priority) {
    case "URGENT":
    case "HIGH":
      return "bg-red-500";
    case "MEDIUM":
      return "bg-amber-500";
    default:
      return "bg-gray-300 dark:bg-slate-600";
  }
}

/** "Website · Acme" — whichever of project and client the task has. */
function subline(t: MyTask): string {
  const parts = [t.projectName, t.clientName].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "No project";
}

/**
 * The due date, or "Overdue" in red when it has slipped. Parsed as plain
 * numbers from the ISO date so an evening deadline doesn't read as tomorrow.
 */
function DuePill({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  const todayISO = new Date().toLocaleDateString("en-CA");
  const overdue = day < todayISO;
  const [, m, d] = day.split("-").map(Number);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = overdue ? "Overdue" : `${d} ${MONTHS[m - 1] ?? ""}`;
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
        overdue
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-slate-400"
      }`}
    >
      {label}
    </span>
  );
}
