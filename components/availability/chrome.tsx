"use client";

/**
 * The shared vocabulary of the availability screens.
 *
 * Tone, icon and wording live here — once — because the grid, the day list,
 * the drawer and the crew finder all have to say the same thing about the same
 * day. When each screen picked its own colours, "busy" meant amber in one
 * place and nothing at all in another, and the legend was wrong about both.
 *
 * Nothing here relies on colour alone. Every state carries an icon and a word,
 * so it survives greyscale, a projector, and colour-blindness — which matters
 * more here than on most screens, because red and green are doing the work of
 * "cannot" and "can".
 */

import type { ReactNode } from "react";
import {
  CheckCircle2, Clock, Flame, UserMinus, Thermometer, Camera, Briefcase, Ban,
} from "lucide-react";
import { loadLevel, type DayCell, type UnavailabilityKind } from "@/lib/availability";

export type Tone =
  | "free" | "light" | "busy" | "heavy"
  | "leave" | "sick" | "shoot" | "other_client" | "other";

export function toneOf(cell: DayCell): Tone {
  if (cell.block) {
    if (cell.block.leave || cell.block.kind === "LEAVE") return "leave";
    const map: Record<UnavailabilityKind, Tone> = {
      SHOOT: "shoot", LEAVE: "leave", SICK: "sick",
      OTHER_CLIENT: "other_client", OTHER: "other",
    };
    return map[cell.block.kind] ?? "other";
  }
  // No load visible is not the same as a full diary — say free, not busy.
  return loadLevel(cell.load ?? 0);
}

/** Cell fill. Kept faint: fifty rows of saturated colour is unreadable. */
export const TONE_CELL: Record<Tone, string> = {
  free: "bg-emerald-50/70 text-emerald-800 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  light: "bg-amber-50/70 text-amber-800 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  busy: "bg-amber-100/70 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25",
  heavy: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
  leave: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
  sick: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
  shoot: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/25",
  other_client: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25",
  other: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10",
};

/** The dot/word form, for chips and lists. */
export const TONE_CHIP: Record<Tone, string> = TONE_CELL;

export const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  free: CheckCircle2, light: Clock, busy: Clock, heavy: Flame,
  leave: UserMinus, sick: Thermometer, shoot: Camera,
  other_client: Briefcase, other: Ban,
};

/** What the legend says each tone means. */
const TONE_LEGEND: { tone: Tone; label: string }[] = [
  { tone: "free", label: "Available" },
  { tone: "light", label: "1 job" },
  { tone: "busy", label: "2 jobs" },
  { tone: "heavy", label: "Heavily booked" },
  { tone: "leave", label: "Leave" },
  { tone: "sick", label: "Sick" },
  { tone: "shoot", label: "On a shoot" },
  { tone: "other_client", label: "Other client" },
];

export function Legend({ seesLoad }: { seesLoad: boolean }) {
  // Hiding the workload swatches from somebody who never sees them keeps the
  // key honest — a legend that explains colours you cannot get is clutter.
  const items = seesLoad ? TONE_LEGEND : TONE_LEGEND.filter((t) => !["light", "busy", "heavy"].includes(t.tone));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
      {items.map(({ tone, label }) => {
        const Icon = TONE_ICON[tone];
        return (
          <span key={tone} className="inline-flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded border ${TONE_CELL[tone]}`}>
              <Icon className="w-2.5 h-2.5" aria-hidden />
            </span>
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function StatusChip({ cell, className = "" }: { cell: DayCell; className?: string }) {
  const tone = toneOf(cell);
  const Icon = TONE_ICON[tone];
  const word = cell.block
    ? (cell.block.leave ? "Approved leave" : undefined)
    : undefined;
  const label = word ?? labelOf(cell);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${TONE_CHIP[tone]} ${className}`}>
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
      {label}
    </span>
  );
}

function labelOf(cell: DayCell): string {
  if (cell.block) {
    const map: Record<UnavailabilityKind, string> = {
      SHOOT: "On a shoot", LEAVE: "Leave", SICK: "Sick",
      OTHER_CLIENT: "Other client", OTHER: "Unavailable",
    };
    return map[cell.block.kind] ?? "Unavailable";
  }
  if (cell.load === null) return "Available";
  if (cell.load === 0) return "Available";
  if (cell.load === 1) return "Available · 1 job";
  if (cell.load === 2) return "2 jobs";
  return `Heavily booked · ${cell.load} jobs`;
}

/** Small, flat KPI. Deliberately not a dashboard card — it is a counter. */
export function Kpi({
  label, value, hint, dot, active, onClick,
}: {
  label: string; value: ReactNode; hint?: string; dot?: string;
  active?: boolean; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />}
        <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-100 leading-none">
          {value}
        </span>
        {hint && <span className="text-[11px] text-gray-400 ml-auto tabular-nums">{hint}</span>}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{label}</p>
    </>
  );
  // Capped width on purpose: these are counters, not dashboard cards, and on a
  // wide screen flex-1 alone stretched four of them across 1600px of nothing.
  const base = `text-left px-3 py-2 rounded-xl border transition-colors min-w-[7.5rem] max-w-[13rem] flex-1 ${
    active
      ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10"
      : "border-gray-200 bg-white dark:border-white/[0.08] dark:bg-slate-900"
  }`;
  if (!onClick) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button" onClick={onClick} aria-pressed={!!active}
      className={`${base} hover:border-gray-300 dark:hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
    >
      {inner}
    </button>
  );
}

export function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: 6 | 7 | 9 }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const dim = size === 9 ? "w-9 h-9 text-xs" : size === 6 ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-[11px]";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${dim} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}
