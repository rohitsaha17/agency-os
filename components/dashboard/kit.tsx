"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The dashboard's panels.
 *
 * WHY INDIGO AND NOT ORANGE
 *
 * The reference these were built from is orange, and not one orange value
 * appears below. Every accent here is an indigo utility, because the Gloo
 * theme redefines the indigo ramp (see app/globals.css) — so these panels
 * come out orange in Gloo and indigo in every other workspace, from one set
 * of classes. Writing #ff4d1d here would have made the premium treatment
 * Gloo's alone and left everybody else with a mismatched page.
 *
 * WHY A GRADIENT AT ALL
 *
 * A flat card and a lit one carry the same information; the lit one says
 * which part of the page was designed to be looked at. It is a wash at 7%
 * over the top-left corner, not a fill — strong enough to separate these
 * panels from the plain cards around them, weak enough that text keeps its
 * contrast on top of it.
 */
export function Panel({
  icon, title, subtitle, href, hrefLabel = "View all", accent, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  /** Turns the wash up and the border warm. For the thing that wants doing. */
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        accent
          ? "border-indigo-300 dark:border-indigo-500/40"
          : "border-gray-200 dark:border-white/[0.07]"
      } bg-white dark:bg-slate-900`}
    >
      {/* The wash. aria-hidden and pointer-events-none: it is lighting, not content. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
          accent
            ? "from-indigo-500/[0.16] via-indigo-500/[0.04] to-transparent"
            : "from-indigo-500/[0.07] via-transparent to-transparent"
        }`}
      />

      <div className="relative">
        <header className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3">
          <span
            aria-hidden="true"
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {href && (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline flex-shrink-0"
            >
              {hrefLabel}
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * The date, stacked, at a fixed width.
 *
 * Fixed because a column of dates that shifts left and right as the numbers
 * change is harder to scan than one that does not, and scanning is the only
 * thing anybody does to these lists. tabular-nums for the same reason.
 */
export function DayBlock({ iso }: { iso: string }) {
  const [, m, d] = iso.split("-").map(Number);
  return (
    <div className="w-9 flex-shrink-0 text-center leading-none">
      <div className="text-[15px] font-bold text-gray-900 tabular-nums">
        {String(d).padStart(2, "0")}
      </div>
      <div className="text-[9px] font-semibold tracking-wider text-gray-400 mt-1">
        {MONTHS[m - 1] ?? ""}
      </div>
    </div>
  );
}

/**
 * Somebody's initials, coloured from their name.
 *
 * A stable hue per person rather than one accent for everybody: in a list of
 * five names the colour is what your eye finds first, and five identical
 * circles give it nothing to find. Deliberately not the brand colour — these
 * are people, not actions.
 */
const FACE_TONES = [
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  // Not violet: the Gloo theme folds violet into its brand ramp, so that tone
  // came out as the accent and a person's circle matched the "Today" label
  // beside it. Pink is left alone by the ramp, so six hues stay six in both.
  "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
];

export function Initials({ name, size = 30 }: { name: string; size?: number }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const tone = FACE_TONES[hash % FACE_TONES.length];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${tone}`}
    >
      {letters}
    </span>
  );
}

/** One line in a panel's list. */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-t border-gray-100 dark:border-white/[0.05]">
      {children}
    </li>
  );
}

/** Nothing to show, said in one quiet line rather than an empty box. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 sm:px-5 pb-4 text-xs text-gray-500">{children}</p>;
}

/** A small squared-off label — a weekday, a count. */
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-slate-400 flex-shrink-0">
      {children}
    </span>
  );
}
