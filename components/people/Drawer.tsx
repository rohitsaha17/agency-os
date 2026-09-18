"use client";

/**
 * The right-hand drawer, used by every People screen.
 *
 * The module used to answer "tell me more about this row" with either a modal
 * or a whole page. A modal covers the table you were comparing against; a page
 * loses your filters, your month and your scroll position, and getting back
 * costs a round trip. A drawer keeps the list on screen and the context
 * intact, which is what makes clicking through ten people feel fast.
 *
 * One component rather than five, so an employee, an attendance month, a
 * payslip and an advance all open the same way, close the same way, and
 * behave the same for somebody using a keyboard.
 *
 * On a phone it is a full-screen sheet instead — 400px of drawer on a 375px
 * screen is just a worse dialog.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Read out as the drawer's name, and shown in the header. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sits left of the close button — a status chip, a month stepper. */
  headerAside?: ReactNode;
  /** Pinned below the scrolling body. Actions live here, never in the body. */
  footer?: ReactNode;
  children: ReactNode;
  /** An accessible name when `title` is a node rather than a string. */
  label?: string;
}

export function Drawer({
  open, onClose, title, subtitle, headerAside, footer, children, label,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Where focus came from, so closing puts it back on the row that opened
    // this rather than at the top of the document.
    restoreTo.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    // Into the panel, so the next Tab lands inside it and not back in the
    // table behind.
    const first = focusables()[0];
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      // Wrap, so Tab cannot walk out of the drawer into the page underneath.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Phones only. On a wide screen the drawer sits beside the table and
          dimming it would hide the thing you are comparing against. */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : "Details")}
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 outline-none
          lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[400px] lg:shadow-2xl
          lg:border-l lg:border-gray-200 dark:lg:border-white/[0.08]"
      >
        <header className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100 truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-[12px] text-gray-500 dark:text-slate-400 truncate mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
          {headerAside}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="p-1.5 -m-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">{children}</div>

        {footer && (
          <footer className="flex-shrink-0 border-t border-gray-100 dark:border-white/[0.06] px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}

/** A label/value line inside a drawer. The module's only detail layout. */
export function DrawerLine({
  label, value, tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "muted" | "strong";
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-[12px]">
      <span className="text-gray-400 dark:text-slate-500 w-[7.5rem] flex-shrink-0">{label}</span>
      <span
        className={`min-w-0 break-words ${
          tone === "muted"
            ? "text-gray-500 dark:text-slate-400"
            : tone === "strong"
              ? "text-gray-900 dark:text-slate-100 font-semibold"
              : "text-gray-900 dark:text-slate-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** A titled block inside a drawer. */
export function DrawerSection({
  title, children, aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
