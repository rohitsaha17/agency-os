"use client";

/**
 * What the colours mean.
 *
 * The board carries a lot of colour — a tinted row, a coloured left edge, a
 * red date — and none of it said what it stood for. A colour key you have to
 * learn by watching what changes when you press things is not a key, it is a
 * puzzle, and the people worst served by it are the ones here least often.
 *
 * The same six statuses the rows are tinted with, in the same order the work
 * moves through them, drawn with the same swatches. If these ever stop
 * matching the rows, the legend is the thing that is wrong.
 */

import type { TaskStatus } from "@/types";

/** Left-edge colour per status. Mirrors STATUS_ROW_TINT on the tasks page. */
const SWATCH: Record<TaskStatus, string> = {
  TODO: "bg-gray-300 dark:bg-slate-600",
  IN_PROGRESS: "bg-blue-500",
  IN_REVIEW: "bg-amber-400",
  CHANGES_REQUESTED: "bg-orange-500",
  BLOCKED: "bg-red-500",
  DONE: "bg-emerald-500",
};

/** In the order work actually moves, not alphabetical. */
const ORDER: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "CHANGES_REQUESTED", label: "Changes asked for" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "DONE", label: "Done" },
];

export function StatusLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-gray-500 dark:text-slate-400 ${className}`}
    >
      {ORDER.map(({ status, label }) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <i className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${SWATCH[status]}`} aria-hidden />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <i className="px-1 py-px rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[9px] font-medium not-italic">
          date
        </i>
        past its due date
      </span>
    </div>
  );
}
