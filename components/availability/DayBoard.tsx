"use client";

/**
 * One day, as a list — the phone's home view, and the desktop's Day view.
 *
 * A grid does not survive a 375px screen. Squeezing seven columns into it gives
 * cells too small to read and too small to hit, and stacking the desktop lists
 * instead just moves the scrolling problem. So on a phone the question narrows
 * to the one you actually ask there: not "what does the week look like" but
 * "who can shoot today".
 *
 * Sorted by what you can act on. Available first and least loaded at the top,
 * because that is the person to call; away at the bottom with the reason, so
 * you stop looking for them rather than wondering.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cellLabel, dayStatus, type DayCell } from "@/lib/availability";
import { Avatar, TONE_CELL, TONE_ICON, toneOf } from "./chrome";

export interface DayRow {
  person: { id: string; name: string; avatarUrl: string | null; craft: string | null };
  cell: DayCell;
}

interface Props {
  date: string;
  /** The strip of days you can jump between. */
  strip: { key: string; dom: number; weekday: string }[];
  today: string;
  rows: DayRow[];
  selectedUserId: string | null;
  onPickDate: (date: string) => void;
  onStepDay: (delta: number) => void;
  onSelect: (userId: string) => void;
}

export function DayBoard({
  date, strip, today, rows, selectedUserId, onPickDate, onStepDay, onSelect,
}: Props) {
  const available = rows.filter((r) => dayStatus(r.cell) === "available")
    .sort((a, b) => (a.cell.load ?? 0) - (b.cell.load ?? 0) || a.person.name.localeCompare(b.person.name));
  const busy = rows.filter((r) => dayStatus(r.cell) === "busy")
    .sort((a, b) => (a.cell.load ?? 0) - (b.cell.load ?? 0));
  const away = rows.filter((r) => dayStatus(r.cell) === "away");

  return (
    <div className="space-y-4">
      {/* Horizontal date selector. Scrolls, snaps, and keeps today marked. */}
      <div className="flex items-center gap-1">
        <button
          type="button" onClick={() => onStepDay(-7)} aria-label="Previous week"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex gap-1 overflow-x-auto snap-x scrollbar-none">
          {strip.map((d) => {
            const on = d.key === date;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onPickDate(d.key)}
                aria-current={on ? "date" : undefined}
                className={`snap-start flex-1 min-w-[3rem] rounded-xl border px-1 py-1.5 text-center transition-colors ${
                  on
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : d.key === today
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300"
                      : "bg-white border-gray-200 text-gray-600 dark:bg-slate-900 dark:border-white/[0.08] dark:text-slate-300 hover:border-gray-300"
                }`}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-80">{d.weekday}</span>
                <span className="block text-[13px] font-semibold tabular-nums">{d.dom}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button" onClick={() => onStepDay(7)} aria-label="Next week"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">
          Nobody matches these filters.
        </p>
      ) : (
        <div className="space-y-4">
          <Section title="Available" count={available.length} rows={available} selectedUserId={selectedUserId} onSelect={onSelect} />
          <Section title="Busy" count={busy.length} rows={busy} selectedUserId={selectedUserId} onSelect={onSelect} />
          <Section title="Away" count={away.length} rows={away} selectedUserId={selectedUserId} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

function Section({
  title, count, rows, selectedUserId, onSelect,
}: {
  title: string; count: number; rows: DayRow[];
  selectedUserId: string | null; onSelect: (id: string) => void;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1.5">
        {title} <span className="font-normal text-gray-400 tabular-nums">({count})</span>
      </h3>
      <ul className="space-y-1">
        {rows.map(({ person, cell }) => {
          const tone = toneOf(cell);
          const Icon = TONE_ICON[tone];
          const { head, sub } = cellLabel(cell);
          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelect(person.id)}
                aria-pressed={selectedUserId === person.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  selectedUserId === person.id
                    ? "border-indigo-400 bg-indigo-50/50 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                    : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-slate-900 dark:hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={person.name} url={person.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{person.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{person.craft ?? "Team"}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium flex-shrink-0 max-w-[45%] ${TONE_CELL[tone]}`}>
                  <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
                  <span className="truncate">{head}</span>
                  {sub && <span className="opacity-70 truncate hidden sm:inline">· {sub}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
