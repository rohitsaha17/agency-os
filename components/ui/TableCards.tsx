"use client";

/**
 * A table that becomes a list of cards on a phone.
 *
 * Nine screens in this app put a desktop table in front of a phone and left
 * it at that: eight columns squeezed into 375px, or a horizontal scrollbar
 * nobody drags. Both are the same failure — the row is the unit of meaning,
 * and neither shows you a whole one.
 *
 * Below `sm` this restacks each row into a card, one field per line with its
 * column heading beside it. Above `sm` it does nothing at all: the table is
 * the original table, with the original markup, and the desktop layout is
 * untouched.
 *
 * WHY THE LABELS ARE READ AT RUNTIME
 *
 * The usual version of this pattern asks every <td> to carry a data-label
 * with its column name written out again. That is hundreds of hand-typed
 * strings across nine files, each of which is a second copy of a heading that
 * can quietly stop matching the first — and getting it wrong on an invoice
 * table means labelling a number as the wrong thing, which is worse than no
 * label.
 *
 * So the labels come from the <th> cells that are already there, by index,
 * and they cannot disagree because there is only one copy. A column renamed
 * on the desktop is renamed on the phone in the same edit.
 *
 * WHAT IT DELIBERATELY SKIPS
 *
 * A cell whose heading is blank — the action column, the chevron — gets no
 * label, because "" followed by a button reads as a broken row. An empty cell
 * is hidden outright on a phone: a card of dashes is noise, and the desktop
 * table still shows them where the alignment makes them meaningful.
 *
 * This is for tables of RECORDS. It is not for a matrix — an attendance month
 * or an availability grid — where the cell only means anything at the
 * intersection of its row and column. Those get a purpose-built phone view
 * instead; restacking them would produce thirty lines of "14: present".
 */

import { useEffect, useRef, type ReactNode } from "react";

export function TableCards({
  children,
  className = "",
  /** Re-reads the headings when this changes — pass the row count or a key. */
  watch,
}: {
  children: ReactNode;
  className?: string;
  watch?: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = box.current;
    if (!root) return;

    const apply = () => {
      root.querySelectorAll("table").forEach((table) => {
        // Only this table's own header row — a nested table inside a cell
        // keeps its own headings rather than inheriting the outer ones.
        const headRow = table.querySelector("thead tr");
        if (!headRow) return;
        const labels = Array.from(headRow.children).map(
          (th) => (th.textContent ?? "").trim(),
        );

        table.querySelectorAll("tbody tr").forEach((tr) => {
          if (tr.closest("table") !== table) return;
          Array.from(tr.children).forEach((td, i) => {
            const label = labels[i] ?? "";
            const cell = td as HTMLElement;
            if (label) cell.setAttribute("data-label", label);
            else cell.removeAttribute("data-label");
            // A row that spans the whole table is a section break or an
            // "add a line" affordance, not a field. Leave it full width.
            const span = Number(cell.getAttribute("colspan") ?? "1");
            if (span > 1) cell.setAttribute("data-full", "");
            // Marked rather than measured, so the stylesheet can hide it
            // without this component knowing what "empty" looks like.
            if (!(cell.textContent ?? "").trim() && !cell.querySelector("button, a, input, select, svg")) {
              cell.setAttribute("data-empty", "");
            } else {
              cell.removeAttribute("data-empty");
            }
          });
        });
      });
    };

    apply();

    // Rows arrive after a fetch, and filters rewrite them. An observer keeps
    // the labels right without every caller remembering to pass `watch`.
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [watch]);

  return (
    <div ref={box} className={`table-cards ${className}`}>
      {children}
    </div>
  );
}
