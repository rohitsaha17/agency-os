"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { usePresence } from "@/lib/usePresence";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  /**
   * Actions pinned below the scrolling body.
   *
   * Without this, a dialog's buttons live inside `children` and therefore
   * inside the scroll area — so on a phone, where the body is nearly always
   * taller than the screen, Save is somewhere below the fold and you have to
   * scroll a form you have already filled in to find it.
   */
  footer?: ReactNode;
  /**
   * A small dialog — a confirm, a short prompt.
   *
   * Stays a centred card on phones instead of becoming a bottom sheet, and
   * tightens the padding to match. The default chrome is sized for a form;
   * around two lines of text it is mostly empty space, and the buttons end up
   * looking oversized because there is nothing near them.
   */
  compact?: boolean;
}

/**
 * HOW IT MOVES
 *
 * On a phone this is a sheet, so it comes up from the bottom edge and goes
 * back down to it — the one motion that says where it came from and where it
 * went. It used to appear and disappear instantly, which on a panel covering
 * most of the screen reads as the screen having been swapped rather than
 * something having opened on top of it.
 *
 * On a desktop it is a centred card with no edge to come from, so it fades
 * and scales from 0.97 instead. Never from scale(0): nothing in the world
 * appears out of nothing, and the eye reads it as a glitch rather than as an
 * entrance.
 *
 * It animates `translate`, `scale` and `opacity` — never width, height or
 * top. Those three skip layout and paint, so this stays on the compositor and
 * holds 60fps on a mid-range phone while the page behind it is still fetching.
 *
 * Naming them individually is a Tailwind v4 requirement, not a preference. v4
 * compiles `translate-y-full` to the independent `translate` property rather
 * than to `transform`, so a transition listing `transform` animates precisely
 * nothing — the sheet jumps and the curve is never used. The first cut of this
 * had exactly that bug, and it took reading the computed style to see it.
 *
 * Reduced motion is handled globally: globals.css collapses every transition
 * to effectively zero, so this still opens and closes and simply does not
 * travel. Nothing extra is needed here.
 */
export function Modal({
  open, onClose, title, children, width = "max-w-lg", footer, compact,
}: ModalProps) {
  // Held on screen for the length of the exit, so there is something left to
  // animate out — see lib/usePresence.
  const { mounted, shown } = usePresence(open, 220);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    // data-modal-open lets the onboarding tour know not to interrupt
    // On a phone the dialog is a sheet: full width, anchored to the bottom,
    // taking the height it needs up to nearly the whole screen. A centred card
    // with 16px of margin on a 375px screen wastes the only space there is,
    // and a form inside it ends up about 280px wide.
    <div
      data-modal-open
      className={`fixed inset-0 z-50 flex justify-center ${
        compact ? "items-center p-4" : "items-end sm:items-center p-0 sm:p-4"
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`relative bg-white dark:bg-slate-900 shadow-2xl w-full flex flex-col dark:ring-1 dark:ring-white/[0.08]
          will-change-[translate,scale,opacity] [transition-property:translate,scale,opacity] ease-[var(--motion-ease-panel)]
          ${width} ${
          compact
            ? "rounded-xl max-h-[90dvh] duration-[var(--motion-base)]"
            : "rounded-t-2xl sm:rounded-xl max-h-[92dvh] sm:max-h-[90dvh] duration-[var(--motion-panel)] sm:duration-[var(--motion-base)]"
        } ${
          // A sheet travels from the bottom edge; a centred card has no edge
          // to travel from, so it scales up the last 3% instead.
          shown
            ? "translate-y-0 opacity-100 sm:scale-100"
            : compact
              ? "scale-[0.97] opacity-0"
              : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-[0.97]"
        }`}
      >
        {/* Grab handle, phones only — says "sheet", and gives a thumb
            somewhere safe to land near the top edge. */}
        {!compact && (
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
            <span className="w-9 h-1 rounded-full bg-gray-200 dark:bg-white/15" />
          </div>
        )}

        {/* Header */}
        <div className={`flex items-center justify-between border-b border-gray-200 dark:border-white/[0.08] flex-shrink-0 ${
          compact ? "px-5 py-3" : "px-4 sm:px-6 py-3 sm:py-4"
        }`}>
          <h2 className={`font-semibold text-gray-900 dark:text-slate-100 truncate pr-2 ${
            compact ? "text-sm" : "text-base"
          }`}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body. Narrower gutters on a phone — 24px each side of a 375px
            screen is 13% of it spent on nothing.

            When there is no footer the body is the bottom edge of the sheet,
            so it carries the home-indicator inset itself; otherwise the
            footer does and doubling it would leave a gap. */}
        <div className={`overflow-y-auto flex-1 overscroll-contain ${
          compact
            ? `px-5 pt-4 ${footer ? "pb-4" : "pb-[calc(1rem+var(--safe-bottom))]"}`
            : `px-4 sm:px-6 pt-4 sm:pt-5 ${footer ? "pb-4 sm:pb-5" : "pb-[calc(1.25rem+var(--safe-bottom))]"}`
        }`}>
          {children}
        </div>

        {/*
          Actions stay put while the body scrolls.

          The bottom padding is written out rather than composed from `py-3`
          plus the `.safe-bottom` helper. That helper sets `padding-bottom`
          outright, and it is a plain class tying with Tailwind's on
          specificity — so it won by stylesheet order and replaced the
          padding with `env(safe-area-inset-bottom)`, which is 0px on a
          desktop. Every dialog with a footer had its buttons sitting flush on
          the bottom border, and the inset it was supposed to add did nothing
          on the phones it was for either.
        */}
        {footer && (
          <div className={`flex-shrink-0 border-t border-gray-200 dark:border-white/[0.08] ${
            compact
              ? "px-5 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]"
              : "px-4 sm:px-6 pt-3 sm:pt-4 pb-[calc(0.75rem+var(--safe-bottom))] sm:pb-[calc(1rem+var(--safe-bottom))]"
          }`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
