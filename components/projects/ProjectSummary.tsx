"use client";

/**
 * How the project is actually going, above the tabs.
 *
 * Purely additive: it sits between the project header and the tab bar, so
 * nothing moved and no tab changed. Whichever tab somebody lands on, the
 * three numbers that decide whether to worry are already on screen — which
 * is the point. They used to be reachable only by opening Tasks and counting.
 *
 * Above the tabs rather than inside a new "Overview" one, deliberately. A new
 * first tab would have changed where everybody lands, and an SMM's day starts
 * on Plan. This costs them one strip of height and no relearning.
 *
 * Every number is derived from tasks the page has already loaded. No request,
 * no endpoint, nothing new to keep in sync.
 */

import { useMemo } from "react";
import { AlertTriangle, CalendarClock, ListTodo } from "lucide-react";
import type { Task } from "@/types";

/** Local calendar day. Via UTC this lands a day out for an Indian team. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  tasks: Task[];
  loading?: boolean;
  /** Jumps to the Tasks tab — the tiles are a way in, not just a readout. */
  onOpenTasks?: () => void;
}

export function ProjectSummary({ tasks, loading, onOpenTasks }: Props) {
  const stats = useMemo(() => {
    const today = localDay(new Date());
    const weekEnd = localDay(new Date(Date.now() + 7 * 86_400_000));

    let done = 0, overdue = 0, dueThisWeek = 0, open = 0;
    // Per section, where a section is the project's own grouping: the
    // creative type for planned content, and whatever the task is for the
    // rest. It mirrors how the work was actually commissioned.
    const bySection = new Map<string, { done: number; total: number }>();

    for (const t of tasks) {
      const finished = t.status === "DONE";
      if (finished) done++; else open++;

      if (!finished && t.dueDate) {
        const day = localDay(new Date(t.dueDate));
        if (day < today) overdue++;
        else if (day <= weekEnd) dueThisWeek++;
      }

      const section = sectionOf(t);
      const row = bySection.get(section) ?? { done: 0, total: 0 };
      row.total++;
      if (finished) row.done++;
      bySection.set(section, row);
    }

    return {
      done, overdue, dueThisWeek, open,
      total: tasks.length,
      sections: [...bySection.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/[0.08] px-4 sm:px-6 lg:px-8 py-4">
        <div className="h-20 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
      </div>
    );
  }

  // A project with no tasks has nothing to report, and a row of zeroes reads
  // like a problem rather than a beginning.
  if (stats.total === 0) return null;

  const pct = Math.round((stats.done / stats.total) * 100);

  const tiles = [
    { key: "overdue", label: "Overdue", value: stats.overdue, icon: AlertTriangle,
      tone: stats.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400" },
    { key: "week", label: "Due this week", value: stats.dueThisWeek, icon: CalendarClock,
      tone: stats.dueThisWeek > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400" },
    { key: "open", label: "Open", value: stats.open, icon: ListTodo,
      tone: stats.open > 0 ? "text-indigo-600 dark:text-indigo-300" : "text-gray-400" },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/[0.08] px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">

        {/* Overall, and the three numbers */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              Overall
            </span>
            <span className="text-[12px] tabular-nums text-gray-500 dark:text-slate-400">
              {stats.done}/{stats.total}
            </span>
          </div>
          <Bar done={stats.done} total={stats.total} />

          <div className="grid grid-cols-3 gap-2 mt-3">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={onOpenTasks}
                  className="text-left px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.16] transition-surface duration-150"
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    <Icon className="w-3 h-3" /> {t.label}
                  </span>
                  <span className={`block text-2xl font-semibold tabular-nums mt-0.5 ${t.tone}`}>
                    {t.value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Where the work sits */}
        {stats.sections.length > 1 && (
          <div className="lg:w-[320px] flex-shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1.5">
              Progress by section
            </p>
            <div className="space-y-2">
              {stats.sections.map((s) => (
                <div key={s.name}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-gray-700 dark:text-slate-300 truncate">{s.name}</span>
                    <span className="text-[11px] tabular-nums text-gray-400 flex-shrink-0">
                      {s.done}/{s.total}
                    </span>
                  </div>
                  <Bar done={s.done} total={s.total} thin />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ done, total, thin }: { done: number; total: number; thin?: boolean }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className={`${thin ? "h-1.5" : "h-2"} bg-gray-100 dark:bg-white/[0.08] rounded-full overflow-hidden`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${done} of ${total} done`}
    >
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** What bucket a task belongs to, in the project's own terms. */
function sectionOf(t: Task): string {
  const kind = (t as Task & { kind?: string }).kind;
  if (kind === "PLANNING") return "Planning";
  if (kind === "POST") return "Posting";
  if (kind === "CONTENT_WORK") return "Content";
  return "General";
}
