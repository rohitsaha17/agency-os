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

export type SummaryBucket = "overdue" | "week" | "open";

/**
 * Every task, subtasks included.
 *
 * GET /api/projects/[id]/tasks returns a TREE — roots carrying their children
 * — so counting the array it hands back counts only the top level. A project
 * whose work is mostly subtasks would have reported a fraction of itself, and
 * the tile would have been confidently wrong rather than obviously broken.
 */
export function flattenTasks(list: Task[]): Task[] {
  return list.flatMap((t) => [
    t,
    ...flattenTasks(((t as Task & { children?: Task[] }).children ?? []) as Task[]),
  ]);
}

/**
 * Does this task belong in that tile?
 *
 * Exported because the project page filters its task list with the very same
 * function the tile counted with. If the count and the filter were written
 * twice they would disagree eventually, and a tile that says 1 and opens a
 * list of 2 is worse than no tile.
 */
export function inBucket(t: Task, bucket: SummaryBucket, now: Date = new Date()): boolean {
  if (t.status === "DONE") return false;
  if (bucket === "open") return true;
  if (!t.dueDate) return false;
  const day = localDay(new Date(t.dueDate));
  const today = localDay(now);
  if (bucket === "overdue") return day < today;
  return day >= today && day <= localDay(new Date(now.getTime() + 7 * 86_400_000));
}

/** Local calendar day. Via UTC this lands a day out for an Indian team. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  tasks: Task[];
  loading?: boolean;
  /** Which tile is currently filtering the list, if any. */
  active?: SummaryBucket | null;
  /** Pressing a tile filters the task list to it; pressing it again clears. */
  onSelect?: (bucket: SummaryBucket | null) => void;
}

export function ProjectSummary({ tasks, loading, active, onSelect }: Props) {
  const stats = useMemo(() => {
    const all = flattenTasks(tasks);

    let done = 0, overdue = 0, dueThisWeek = 0, open = 0;
    // Per section, where a section is the project's own grouping: the
    // creative type for planned content, and whatever the task is for the
    // rest. It mirrors how the work was actually commissioned.
    const bySection = new Map<string, { done: number; total: number }>();

    for (const t of all) {
      const finished = t.status === "DONE";
      if (finished) done++; else open++;

      if (inBucket(t, "overdue")) overdue++;
      else if (inBucket(t, "week")) dueThisWeek++;

      const section = sectionOf(t);
      const row = bySection.get(section) ?? { done: 0, total: 0 };
      row.total++;
      if (finished) row.done++;
      bySection.set(section, row);
    }

    return {
      done, overdue, dueThisWeek, open,
      total: all.length,
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

  const tiles: { key: SummaryBucket; label: string; value: number; icon: typeof AlertTriangle; tone: string; ring: string }[] = [
    { key: "overdue", label: "Overdue", value: stats.overdue, icon: AlertTriangle,
      tone: stats.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400",
      ring: "border-red-400 dark:border-red-500 ring-1 ring-red-400/30" },
    { key: "week", label: "Due this week", value: stats.dueThisWeek, icon: CalendarClock,
      tone: stats.dueThisWeek > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400",
      ring: "border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/30" },
    { key: "open", label: "Open", value: stats.open, icon: ListTodo,
      tone: stats.open > 0 ? "text-indigo-600 dark:text-indigo-300" : "text-gray-400",
      ring: "border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-400/30" },
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
              const on = active === t.key;
              // A tile with nothing in it filters to an empty list, which
              // reads as a broken page rather than good news.
              const usable = t.value > 0 && !!onSelect;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => usable && onSelect?.(on ? null : t.key)}
                  disabled={!usable}
                  aria-pressed={on}
                  title={
                    !usable ? `No ${t.label.toLowerCase()} tasks`
                      : on ? "Showing these — press again for all tasks"
                        : `Show only ${t.label.toLowerCase()}`
                  }
                  className={`text-left px-3 py-2.5 rounded-xl border transition-surface duration-150 ${
                    on
                      ? t.ring
                      : "border-gray-200 dark:border-white/[0.08] " +
                        (usable ? "hover:border-gray-300 dark:hover:border-white/[0.16] cursor-pointer" : "cursor-default opacity-70")
                  }`}
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
