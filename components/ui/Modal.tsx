"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

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
  /** Opt out of the phone full-screen treatment for genuinely tiny dialogs. */
  compact?: boolean;
}

export function Modal({
  open, onClose, title, children, width = "max-w-lg", footer, compact,
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`relative bg-white dark:bg-slate-900 shadow-2xl w-full flex flex-col dark:ring-1 dark:ring-white/[0.08] ${width} ${
          compact
            ? "rounded-xl max-h-[90dvh]"
            : "rounded-t-2xl sm:rounded-xl max-h-[92dvh] sm:max-h-[90dvh]"
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
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-white/[0.08] flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 truncate pr-2">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body. Narrower gutters on a phone — 24px each side of a 375px
            screen is 13% of it spent on nothing. */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-5">{children}</div>

        {/* Actions stay put while the body scrolls. */}
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-white/[0.08] px-4 sm:px-6 py-3 sm:py-4 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
