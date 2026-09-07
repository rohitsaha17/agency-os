import type { KeyboardEvent } from "react";

/**
 * Make a non-button element behave like one, for keyboard users too.
 *
 * A `<div onClick>` works with a mouse and is invisible to anyone driving the
 * app from the keyboard: it can't be tabbed to and Enter does nothing. That is
 * fine for a redundant affordance — a modal backdrop that closes on click when
 * Escape and a Close button also do — and not fine when the div IS the control,
 * which is the case for a task row, a calendar day or a file card.
 *
 * Spreading this gives the element a role, a tab stop, and Enter/Space
 * activation, which is what a real button would have had.
 *
 * The honest fix is usually `<button>`. This exists for the cases where that
 * isn't available — a grid cell, or a row that already contains buttons of its
 * own and so cannot legally be one.
 */
export function clickable(onActivate: () => void, opts: { role?: "button" | "gridcell" } = {}) {
  return {
    role: opts.role ?? "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      // Space scrolls the page by default; a control that swallows the key
      // must also swallow that.
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/**
 * The same for a two-state control built out of divs.
 *
 * `role="switch"` with `aria-checked` is what tells a screen reader this is a
 * toggle and which way it is set — without it the control is announced as
 * nothing at all, and its state not at all.
 */
export function toggleable(checked: boolean, onToggle: () => void) {
  return {
    role: "switch" as const,
    "aria-checked": checked,
    tabIndex: 0,
    onClick: onToggle,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
  };
}
