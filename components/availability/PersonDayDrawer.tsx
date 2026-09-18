"use client";

/**
 * One person, one day, everything we know.
 *
 * A grid cell can hold four words. The moment somebody clicks it they want the
 * other twenty: why is he out, who put him out, what is he already on, and can
 * I do anything about it. That belongs beside the grid rather than on top of
 * it — a modal would hide the row you are comparing against, which is the
 * whole reason you clicked.
 *
 * The one thing it must never blur: a day that came from approved leave is not
 * a day this person chose, and it is not theirs to clear. It says so, and it
 * offers no delete button — the way out is to revoke the leave, which removes
 * these days properly and leaves the approval meaning something.
 */

import { useEffect } from "react";
import Link from "next/link";
import {
  X, ChevronLeft, ChevronRight, Plus, Trash2, ShieldCheck, ExternalLink, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LOAD_LABEL, loadLevel, KIND_LABEL, type DayCell } from "@/lib/availability";
import { Avatar, StatusChip, toneOf, TONE_CELL } from "./chrome";

export interface DrawerPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
}

export interface DrawerBlock {
  id: string;
  kind: string;
  reason: string;
  leave: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

interface Props {
  person: DrawerPerson;
  date: string;
  cell: DayCell;
  block: DrawerBlock | null;
  /** Titles of what is already due on them — planners only. */
  schedule: string[] | null;
  scheduleLoading: boolean;
  seesLoad: boolean;
  canBlock: boolean;
  onClose: () => void;
  onStepDay: (delta: number) => void;
  onBlockThisDay: () => void;
  onClear: (blockId: string) => void;
  clearing: boolean;
}

function longDay(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function PersonDayDrawer({
  person, date, cell, block, schedule, scheduleLoading, seesLoad,
  canBlock, onClose, onStepDay, onBlockThisDay, onClear, clearing,
}: Props) {
  // Escape closes it, the same as every dialog in the app.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const level = loadLevel(cell.load ?? 0);
  const tone = toneOf(cell);

  return (
    <aside
      role="complementary"
      aria-label={`${person.name}, ${longDay(date)}`}
      className="flex flex-col h-full w-full lg:w-[340px] flex-shrink-0 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-white/[0.08]"
    >
      <header className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
        <Avatar name={person.name} url={person.avatarUrl} size={9} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{person.name}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
            {person.craft ?? "Team"}
          </p>
        </div>
        <button
          type="button" onClick={onClose} aria-label="Close details"
          className="p-1.5 -m-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Stepping a day at a time without going back to the grid: comparing
          Thursday with Friday for one person is the commonest follow-up. */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
        <button
          type="button" onClick={() => onStepDay(-1)} aria-label="Previous day"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="flex-1 text-center text-[12px] font-medium text-gray-900 dark:text-slate-100">
          {longDay(date)}
        </span>
        <button
          type="button" onClick={() => onStepDay(1)} aria-label="Next day"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* The headline: can this person take work. */}
        <div className={`rounded-xl border px-3 py-2.5 ${TONE_CELL[tone]}`}>
          <div className="flex items-center justify-between gap-2">
            <StatusChip cell={cell} className="bg-transparent border-transparent px-0 text-[13px] font-semibold" />
            {block?.leave && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
                <ShieldCheck className="w-3 h-3" aria-hidden /> Approved
              </span>
            )}
          </div>
          <p className="text-[11px] opacity-80 mt-1">
            {block
              ? block.reason
              : "No unavailability recorded — work can be assigned on this day."}
          </p>
        </div>

        {/* Workload, and what it is not. */}
        {seesLoad && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
              Workload
            </h3>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {LOAD_LABEL[level]}
                </span>
                <span className="text-[11px] text-gray-400 capitalize">{level}</span>
              </div>
              {/* A gauge with no maximum, because there isn't one. Four bars
                  that fill up would be claiming a cap the rule does not have. */}
              <div className="mt-2 flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i < Math.min(cell.load ?? 0, 4)
                        ? "bg-indigo-500"
                        : "bg-gray-200 dark:bg-white/10"
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                A signal, not a limit. Whether one more is too many is your call.
              </p>
            </div>
          </section>
        )}

        {/* What they are already on. */}
        {seesLoad && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
              Due this day
            </h3>
            {scheduleLoading ? (
              <div className="space-y-1.5">
                {[0, 1].map((i) => (
                  <div key={i} className="h-9 rounded-lg bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
                ))}
              </div>
            ) : schedule && schedule.length > 0 ? (
              <ul className="space-y-1">
                {schedule.map((title, i) => (
                  <li
                    key={`${title}-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-white/[0.08] px-2.5 py-2"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden />
                    <span className="text-[12px] text-gray-800 dark:text-slate-200 leading-snug">{title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-gray-400 dark:text-slate-500">Nothing due on them.</p>
            )}
          </section>
        )}

        {/* The block itself, and who is responsible for it. */}
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
            Availability
          </h3>
          {block ? (
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] divide-y divide-gray-100 dark:divide-white/[0.06] text-[12px]">
              <Line label="Reason" value={block.reason} />
              <Line
                label="Type"
                value={block.leave ? "Approved leave" : (KIND_LABEL[block.kind as keyof typeof KIND_LABEL] ?? block.kind)}
              />
              {/* createdById finally earns its keep. "An admin marked you out
                  on the 3rd" was invisible before, which is a bad way to find
                  out you cannot be given work. */}
              <Line label="Recorded by" value={block.createdBy?.name ?? "—"} />
              <Line label="Added" value={shortDate(block.createdAt)} />
            </div>
          ) : (
            <p className="text-[12px] text-gray-400 dark:text-slate-500">No block recorded for this day.</p>
          )}
        </section>
      </div>

      <footer className="flex-shrink-0 border-t border-gray-100 dark:border-white/[0.06] px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
        {block?.leave ? (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
              This day comes from approved leave, so it can&rsquo;t be cleared here.
              Revoking the leave removes it.
            </p>
            <Link
              href="/hr?tab=leave"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Open leave requests <ExternalLink className="w-3 h-3" aria-hidden />
            </Link>
          </div>
        ) : block ? (
          canBlock ? (
            <Button
              variant="secondary" className="w-full" loading={clearing}
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => onClear(block.id)}
            >
              Free this day up
            </Button>
          ) : (
            <p className="text-[11px] text-gray-400">
              Only {person.name.split(" ")[0]} or an admin can clear this day.
            </p>
          )
        ) : canBlock ? (
          <Button className="w-full" icon={<Plus className="w-3.5 h-3.5" />} onClick={onBlockThisDay}>
            Block this day
          </Button>
        ) : (
          <p className="text-[11px] text-gray-400">
            Blocking days is for the shoot crew and admins. Everyone else asks for leave.
          </p>
        )}
      </footer>
    </aside>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span className="text-gray-400 dark:text-slate-500 w-[5.5rem] flex-shrink-0">{label}</span>
      <span className="text-gray-900 dark:text-slate-100 min-w-0 break-words">{value}</span>
    </div>
  );
}
