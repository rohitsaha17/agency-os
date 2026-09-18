"use client";

/**
 * Two ways to look at the same tasks: stacked sections, or columns.
 *
 * Purely presentational. It takes tasks that have already been fetched,
 * scoped and permission-checked, plus the caller's own row renderer — so
 * everything a row does (opening the task, picking a status, answering an
 * assignment, starring) keeps working exactly as it did, and this file has no
 * opinion about any of it. Changing how work is arranged should not be able
 * to change what you can do to it.
 *
 * The grouping is by WHEN, not by project. "What is late and what is today"
 * is the question somebody opens this page with; which project a thing
 * belongs to is how you filter, and the rail already does that.
 *
 * Buckets are computed against the viewer's own clock, deliberately. A due
 * date is a promise made in the office's day, and an editor in Kolkata
 * deciding whether something is "today" should get Kolkata's answer.
 */

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";

export type BucketId = "overdue" | "today" | "tomorrow" | "week" | "later" | "someday" | "done";

export interface Bucket<T> {
  id: BucketId;
  label: string;
  tasks: T[];
  /** Finished, of the total. The reference reads "(0/15)". */
  done: number;
  total: number;
  urgent?: boolean;
}

/** Local calendar day, as YYYY-MM-DD. Never via UTC — see the calendar's off-by-one. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function useBuckets<T>(
  tasks: T[],
  getDue: (t: T) => string | null | undefined,
  isDone: (t: T) => boolean,
): Bucket<T>[] {
  return useMemo(() => {
    const now = new Date();
    const today = localDay(now);
    const tomorrow = localDay(addDays(now, 1));
    const weekEnd = localDay(addDays(now, 7));

    const of: Record<BucketId, T[]> = {
      overdue: [], today: [], tomorrow: [], week: [], later: [], someday: [], done: [],
    };

    for (const t of tasks) {
      // Finished work leaves the timeline entirely. A task completed last
      // Tuesday is not "overdue" — it is done, and showing it in red under
      // Overdue is how a board stops being trusted.
      if (isDone(t)) { of.done.push(t); continue; }

      const due = getDue(t);
      if (!due) { of.someday.push(t); continue; }
      const day = localDay(new Date(due));

      if (day < today) of.overdue.push(t);
      else if (day === today) of.today.push(t);
      else if (day === tomorrow) of.tomorrow.push(t);
      else if (day <= weekEnd) of.week.push(t);
      else of.later.push(t);
    }

    const make = (id: BucketId, label: string, urgent?: boolean): Bucket<T> => ({
      id, label, tasks: of[id], urgent,
      done: of[id].filter(isDone).length,
      total: of[id].length,
    });

    return [
      make("overdue", "Overdue", true),
      make("today", "Today"),
      make("tomorrow", "Tomorrow"),
      make("week", "This week"),
      make("later", "Later"),
      make("someday", "No date"),
      make("done", "Completed"),
    ];
  }, [tasks, getDue, isDone]);
}

interface ViewProps<T> {
  buckets: Bucket<T>[];
  renderRow: (t: T) => React.ReactNode;
  collapsed: Set<BucketId>;
  onToggle: (id: BucketId) => void;
  /** Rendered inside the first bucket — the quick add belongs at the top. */
  header?: React.ReactNode;
  empty?: React.ReactNode;
}

/** Stacked sections, full width. */
export function TaskListView<T>({ buckets, renderRow, collapsed, onToggle, header, empty }: ViewProps<T>) {
  const anything = buckets.some((b) => b.total > 0);
  return (
    <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-1">
      {header}
      {!anything && empty}
      {buckets.map((b) => {
        // An empty bucket is noise. "Tomorrow (0)" tells nobody anything.
        if (b.total === 0) return null;
        const shut = collapsed.has(b.id);
        return (
          <section key={b.id}>
            <button
              type="button"
              onClick={() => onToggle(b.id)}
              aria-expanded={!shut}
              className="w-full flex items-center gap-1.5 px-1 py-2 text-[13px] font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-surface duration-150"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${shut ? "" : "rotate-90"}`}
              />
              <span className={b.urgent ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-slate-300"}>
                {b.label}
              </span>
              <span className="text-gray-400 font-normal tabular-nums">
                ({b.done}/{b.total})
              </span>
            </button>
            {!shut && (
              <div className="space-y-px">
                {b.tasks.map((t) => renderRow(t))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Columns, one per bucket, scrolling sideways. */
export function TaskBoardView<T>({ buckets, renderRow, header, empty }: Omit<ViewProps<T>, "collapsed" | "onToggle">) {
  const shown = buckets.filter((b) => b.total > 0);
  return (
    <div className="h-full overflow-x-auto">
      <div className="h-full flex items-stretch gap-3 p-4 sm:p-6 min-w-min">
        {header && <div className="w-[85vw] sm:w-[320px] flex-shrink-0">{header}</div>}
        {shown.length === 0 && empty}
        {shown.map((b) => (
          <section
            key={b.id}
            className="w-[85vw] sm:w-[320px] flex-shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-2xl"
          >
            <header className="px-4 py-3 flex items-center gap-1.5 flex-shrink-0 border-b border-gray-100 dark:border-white/[0.05]">
              <h2 className={`text-[13px] font-semibold ${
                b.urgent ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-slate-200"
              }`}>
                {b.label}
              </h2>
              <span className="text-[12px] text-gray-400 tabular-nums">({b.done}/{b.total})</span>
            </header>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
              {b.tasks.map((t) => renderRow(t))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
