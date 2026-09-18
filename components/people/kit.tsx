"use client";

/**
 * The parts every People screen is built from.
 *
 * Six screens had six ideas about what a status chip, a summary number and an
 * empty table looked like, so the module read as six products that happened to
 * share a sidebar. One kit fixes that in the only way that lasts: there is now
 * exactly one place to change how a badge looks, and no screen can drift
 * without someone deleting the import.
 *
 * Two rules everything here follows:
 *
 *   Colour is never the message. Every status carries a word and, where it
 *   fits, an icon. A red dot on its own is unreadable to a fair number of
 *   people and meaningless on a projector.
 *
 *   Nothing invents a fact. Where the data does not know something these
 *   render an em dash, not a zero — "—" says nobody has entered it, "0" says
 *   somebody did and it was nothing.
 */

import {
  useEffect, useRef, useState, type ReactNode,
} from "react";
import {
  ChevronLeft, ChevronRight, MoreHorizontal, Search, X,
} from "lucide-react";
import { monthName, shiftMonth } from "@/lib/people";

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export function PersonAvatar({
  name, url, size = "md",
}: {
  name: string; url?: string | null; size?: "sm" | "md" | "lg";
}) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const dim = size === "lg" ? "w-10 h-10 text-[13px]"
    : size === "sm" ? "w-6 h-6 text-[10px]"
      : "w-7 h-7 text-[11px]";
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

/** Avatar plus name and a quiet second line. The module's one person cell. */
export function PersonCell({
  name, url, secondary, size,
}: {
  name: string; url?: string | null; secondary?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <PersonAvatar name={name} url={url} size={size} />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{name}</p>
        {secondary != null && secondary !== "" && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{secondary}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export type Tone = "green" | "red" | "amber" | "blue" | "grey" | "purple";

const TONE: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25",
  red: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25",
  blue: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25",
  grey: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10",
  purple: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/25",
};

const DOT: Record<Tone, string> = {
  green: "bg-emerald-500", red: "bg-rose-500", amber: "bg-amber-500",
  blue: "bg-sky-500", grey: "bg-gray-400", purple: "bg-indigo-500",
};

export function StatusBadge({
  tone = "grey", children, icon, className = "",
}: {
  tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {icon ?? <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[tone]}`} aria-hidden />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Summary numbers
 * ------------------------------------------------------------------ */

/**
 * A counter, not a dashboard card.
 *
 * Capped in width on purpose. Left to stretch, four of these spread across a
 * wide screen and the module starts looking like an analytics product, which
 * is precisely what it is not.
 */
export function SummaryCard({
  label, value, hint, tone, active, onClick, title,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        {tone && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[tone]}`} aria-hidden />}
        <span className="text-[17px] font-semibold tabular-nums text-gray-900 dark:text-slate-100 leading-none flex-shrink-0">
          {value}
        </span>
        {hint != null && (
          // Truncates before the value does. If only one of them fits, it
          // should be the count, not the percentage of it.
          <span className="text-[11px] text-gray-400 ml-auto tabular-nums truncate">{hint}</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1 truncate">{label}</p>
    </>
  );
  const base = `text-left px-3 py-2 rounded-xl border transition-colors max-w-[15rem] flex-1 ${
    active
      ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10"
      : "border-gray-200 bg-white dark:border-white/[0.08] dark:bg-slate-900"
  }`;
  /*
    The minimum width is an inline style, not a class, and it has to be.

    globals.css gives every <button> a 44px minimum under `pointer: coarse`
    for tap targets. That is a plain rule sitting after Tailwind's utilities,
    so it beat `min-w-[8.5rem]` on stylesheet order — on a phone these
    counters collapsed to 61px and the NUMBER truncated away, leaving a card
    that showed only its percentage. A counter with no count.

    These are boxes whose size is the design and they are already far bigger
    than 44px, so the tap-target minimum has nothing to add. An inline style
    is the one thing that outranks it without loosening the rule for
    everything else.
  */
  const width = { minWidth: "8.5rem" };
  if (!onClick) return <div className={base} style={width} title={title}>{inner}</div>;
  return (
    <button
      type="button" onClick={onClick} aria-pressed={!!active} title={title} style={width}
      className={`${base} hover:border-gray-300 dark:hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
    >
      {inner}
    </button>
  );
}

export function SummaryStrip({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Toolbar bits
 * ------------------------------------------------------------------ */

export function SearchBox({
  value, onChange, placeholder = "Search people…", className = "",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
    </div>
  );
}

/** ‹ September 2026 › — the same stepper on Attendance, Leave and Payroll. */
export function MonthStepper({
  month, onChange, label = "month",
}: {
  month: string; onChange: (m: string) => void; label?: string;
}) {
  return (
    <div className="flex items-center border border-gray-200 dark:border-white/[0.1] rounded-lg overflow-hidden bg-white dark:bg-slate-900 flex-shrink-0">
      <button
        type="button" onClick={() => onChange(shiftMonth(month, -1))}
        aria-label={`Previous ${label}`}
        className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-2.5 py-1.5 text-[12px] font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap min-w-[9rem] text-center">
        {monthName(month)}
      </span>
      <button
        type="button" onClick={() => onChange(shiftMonth(month, 1))}
        aria-label={`Next ${label}`}
        className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ClearFilters({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <X className="w-3 h-3" aria-hidden /> Clear filters
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The three-dot menu
 * ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Row actions behind one button.
 *
 * Five buttons on every row is five things to read on every row. One button
 * that opens a list is one, and the list can say what each action does in
 * words rather than an icon you have to learn.
 */
export function RowMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const usable = items.filter((i) => !i.disabled);
  if (usable.length === 0) return null;

  return (
    <div className="relative inline-block" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[11rem] py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.1] rounded-xl shadow-lg"
        >
          {usable.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 dark:hover:bg-white/[0.06] ${
                item.danger
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-700 dark:text-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

/**
 * The module's table shell.
 *
 * No cell borders and no zebra striping — a horizontal rule between rows and
 * a hover tint is enough structure for the eye, and it is the difference
 * between reading like Linear and reading like a spreadsheet export.
 */
export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 border-y sm:border sm:rounded-xl border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900">
      <table className="w-full text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children, align = "left", className = "",
}: {
  children?: ReactNode; align?: "left" | "right" | "center"; className?: string;
}) {
  return (
    <th
      scope="col"
      className={`py-2 px-3 font-medium text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-white/[0.08] whitespace-nowrap ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children, align = "left", className = "", nowrap,
}: {
  children?: ReactNode; align?: "left" | "right" | "center"; className?: string; nowrap?: boolean;
}) {
  return (
    <td
      className={`py-2 px-3 border-b border-gray-100 dark:border-white/[0.05] ${
        align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "text-left"
      } ${nowrap ? "whitespace-nowrap" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** A row you can click into a drawer. Keyboard-openable, and it says so. */
export function Row({
  children, onOpen, selected, label,
}: {
  children: ReactNode; onOpen?: () => void; selected?: boolean; label?: string;
}) {
  return (
    <tr
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      } : undefined}
      tabIndex={onOpen ? 0 : undefined}
      role={onOpen ? "button" : undefined}
      aria-label={onOpen ? label : undefined}
      className={`transition-colors ${
        onOpen ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500" : ""
      } ${
        selected
          ? "bg-indigo-50/60 dark:bg-indigo-500/10"
          : onOpen ? "hover:bg-gray-50 dark:hover:bg-white/[0.04]" : ""
      }`}
    >
      {children}
    </tr>
  );
}

/* ------------------------------------------------------------------ *
 * Nothing to show
 * ------------------------------------------------------------------ */

/**
 * An empty state that fits in the space a table would have taken.
 *
 * Compact on purpose: a half-screen illustration for "no advances yet" makes
 * an ordinary state look like a problem, and it pushes the button that fixes
 * it below the fold.
 */
export function EmptyState({
  title, hint, action, icon,
}: {
  title: string; hint?: string; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 py-10 px-6 text-center">
      {icon && <div className="text-gray-300 dark:text-slate-600 mb-2 flex justify-center">{icon}</div>}
      <p className="text-[13px] font-medium text-gray-700 dark:text-slate-200">{title}</p>
      {hint && <p className="text-[12px] text-gray-400 mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 overflow-hidden ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.05] last:border-0"
        >
          <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/[0.06] animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-32 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-2 w-20 rounded bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
          <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[3.75rem] flex-1 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
      ))}
    </div>
  );
}

/** Only shown on a phone, where the table becomes a list of these. */
export function MobileCard({
  children, onOpen, label,
}: {
  children: ReactNode; onOpen?: () => void; label?: string;
}) {
  const cls =
    "w-full text-left px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl";
  if (!onOpen) return <div className={cls}>{children}</div>;
  return (
    <button
      type="button" onClick={onOpen} aria-label={label}
      className={`${cls} hover:bg-gray-50 dark:hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
    >
      {children}
    </button>
  );
}
