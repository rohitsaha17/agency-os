"use client";

import { useEffect } from "react";

/**
 * Globally auto-opens the native date / time picker when the user clicks
 * anywhere on a `<input type="date">` (or time / datetime-local / month /
 * week) — not just on the tiny calendar icon at the right edge.
 *
 * Uses the modern `HTMLInputElement.showPicker()` API. Browsers that
 * don't support it (very old) fall through to default behavior.
 *
 * Mounted once at the dashboard layout level — no per-input changes needed.
 */
export function DateInputAutoOpen() {
  useEffect(() => {
    const PICKER_TYPES = new Set([
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
    ]);

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!PICKER_TYPES.has(target.type)) return;
      if (target.disabled || target.readOnly) return;

      // showPicker() may throw if the input isn't user-initiated, so guard.
      const el = target as HTMLInputElement & { showPicker?: () => void };
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
        } catch {
          // Silently ignore — browser default behavior still applies.
        }
      }
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
