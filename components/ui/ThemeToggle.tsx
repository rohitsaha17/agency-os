"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";

/* ─────────────────────────────────────────────────────────────
   Full pill toggle — used in desktop sidebar footer
   ───────────────────────────────────────────────────────────── */
export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full
        cursor-pointer transition-all duration-300
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-indigo-500 focus-visible:ring-offset-2
        focus-visible:ring-offset-slate-900
        ${isDark
          ? "bg-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.45)]"
          : "bg-slate-600 hover:bg-slate-500"
        }
      `}
    >
      {/* Sliding knob */}
      <span
        className={`
          pointer-events-none absolute inline-flex h-5 w-5 items-center justify-center
          rounded-full bg-white shadow-md
          transition-transform duration-300 ease-in-out
          ${isDark ? "translate-x-[22px]" : "translate-x-0.5"}
        `}
      >
        {isDark ? (
          <Moon className="h-2.5 w-2.5 text-indigo-600" />
        ) : (
          <Sun className="h-2.5 w-2.5 text-amber-500" />
        )}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icon-only button — used in mobile top bar
   ───────────────────────────────────────────────────────────── */
export function ThemeToggleIcon({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`
        p-2 rounded-lg transition-colors
        text-slate-400 hover:text-white hover:bg-slate-800
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-indigo-500
        ${className}
      `}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-300 rotate-0" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-300 rotate-0" />
      )}
    </button>
  );
}
