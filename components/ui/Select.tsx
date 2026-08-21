"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

/**
 * The app's dropdown.
 *
 * Replaces the native `<select>`, which renders as a different control on
 * every OS — heavy grey chrome on Windows, a system popup on macOS — and can't
 * be styled, so no amount of care on the trigger fixed the list that dropped
 * out of it.
 *
 * This is one control everywhere: a rounded trigger, a panel with a soft
 * shadow, a hover highlight that follows the keyboard as well as the mouse,
 * and a checkmark on the current value.
 *
 * It keeps the parts of a native select that people rely on and hand-rolled
 * dropdowns usually drop:
 *   - full keyboard control (arrows, Home/End, Enter, Escape, Tab)
 *   - type-ahead — press "d" to jump to Done
 *   - the panel flips above the trigger when there's no room below
 *   - proper listbox semantics for screen readers
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Optional colour swatch, e.g. a status dot. */
  color?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when nothing is selected; also the empty choice's label. */
  placeholder?: string;
  /** Renders a label above the trigger. */
  label?: string;
  disabled?: boolean;
  /** Allow clearing back to "". Adds the placeholder as a real choice. */
  allowEmpty?: boolean;
  className?: string;
  /** Compact padding for dense rows (filters, toolbars). */
  size?: "sm" | "md";
  id?: string;
  error?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  label,
  disabled = false,
  allowEmpty = false,
  className = "",
  size = "md",
  id,
  error = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /**
   * The panel renders into document.body at a fixed position.
   *
   * Absolute positioning is clipped by any ancestor with overflow-hidden —
   * a rounded card, a scrolling table — which cuts the list down to a sliver.
   * Measuring the trigger and rendering to the body escapes that entirely.
   */
  const [rect, setRect] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const items = useMemo<SelectOption[]>(
    () => (allowEmpty ? [{ value: "", label: placeholder }, ...options] : options),
    [allowEmpty, options, placeholder],
  );

  const selectedIndex = items.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const pick = useCallback((i: number) => {
    const opt = items[i];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }, [items, onChange]);

  // Open onto the current value, and decide which way the panel should go.
  const openPanel = useCallback(() => {
    if (disabled) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const panelHeight = Math.min(items.length * 34 + 8, 264);
      const flip = r.bottom + panelHeight > window.innerHeight && r.top > panelHeight;
      setRect({
        top: flip ? r.top - panelHeight - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
        flip,
      });
    }
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, items.length, selectedIndex]);

  // Close on an outside click or a scroll that would leave the panel behind.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    // The panel no longer moves with the page, so a scroll closes it.
    const scrolled = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const step = useCallback((dir: 1 | -1) => {
    setActive((cur) => {
      let next = cur;
      for (let i = 0; i < items.length; i++) {
        next = (next + dir + items.length) % items.length;
        if (!items[next]?.disabled) return next;
      }
      return cur;
    });
  }, [items]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openPanel();
      }
      return;
    }

    switch (e.key) {
      case "Escape":   e.preventDefault(); close(); return;
      case "Tab":      setOpen(false); return; // let focus move on
      case "Enter":
      case " ":        e.preventDefault(); pick(active); return;
      case "ArrowDown": e.preventDefault(); step(1); return;
      case "ArrowUp":   e.preventDefault(); step(-1); return;
      case "Home":      e.preventDefault(); setActive(0); return;
      case "End":       e.preventDefault(); setActive(items.length - 1); return;
    }

    // Type-ahead: letters typed within a second of each other build a prefix.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = e.timeStamp;
      const t = typeahead.current;
      t.buffer = now - t.at > 1000 ? e.key : t.buffer + e.key;
      t.at = now;
      const hit = items.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(t.buffer.toLowerCase()),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";

  return (
    // min-w-0 lets this shrink inside a grid or flex row instead of forcing
    // the track wider and overlapping whatever sits next to it.
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div ref={wrapRef} className="relative">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openPanel())}
          onKeyDown={onKeyDown}
          className={`w-full min-w-0 flex items-center gap-2 ${pad} rounded-lg border bg-white dark:bg-slate-800 text-left transition-colors
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            disabled:opacity-60 disabled:cursor-not-allowed
            ${error
              ? "border-red-300 dark:border-red-500/50"
              : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"}`}
        >
          {selected?.color && (
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
          )}
          <span className={`flex-1 truncate ${selected
            ? "text-gray-800 dark:text-slate-100"
            : "text-gray-400 dark:text-slate-500"}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && rect && createPortal(
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            style={{ position: "fixed", top: rect.top, left: rect.left, minWidth: rect.width }}
            className="z-[100] w-max max-w-[min(22rem,85vw)] max-h-64 overflow-y-auto py-1
              rounded-xl bg-white dark:bg-slate-800
              border border-gray-200/80 dark:border-slate-700
              shadow-lg shadow-black/[0.08] dark:shadow-black/40"
          >
            {items.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">No options</p>
            ) : items.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  disabled={o.disabled}
                  onClick={() => pick(i)}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${i === active && !o.disabled ? "bg-gray-100 dark:bg-slate-700/70" : ""}
                    ${isSelected
                      ? "text-gray-900 dark:text-slate-50 font-medium"
                      : "text-gray-700 dark:text-slate-300"}`}
                >
                  {o.color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
                  )}
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
