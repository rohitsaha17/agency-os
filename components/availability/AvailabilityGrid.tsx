"use client";

/**
 * People down the side, days across the top.
 *
 * This is the whole point of the module. The question being asked is "who can
 * shoot on Thursday" — a question about a row of days and a column of people
 * at the same time — and the only shape that answers it in one look is a grid.
 * Two stacked lists made you hold one of the two axes in your head.
 *
 * Three things it is careful about:
 *
 * DENSITY. Fifty people and a month is 1,550 cells. Every one of them is a
 * button, so the row component is memoised and takes an array that only
 * changes when the data does — moving the selection re-renders two rows, not
 * fifty. Nothing here animates on hover beyond a colour, because 1,550
 * transitions is a scroll that stutters.
 *
 * COLOUR IS NEVER THE MESSAGE. Every cell carries an icon and, where there is
 * room, a word. The colour is a second channel, not the only one.
 *
 * KEYBOARD. One tab stop into the grid, then the arrow keys walk it like a
 * spreadsheet. A planner comparing four people across a week should not have
 * to press Tab two hundred times to get to Friday.
 */

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cellDescription, cellLabel, type DayCell } from "@/lib/availability";
import { Avatar, TONE_CELL, TONE_ICON, toneOf } from "./chrome";

export interface GridPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
}

export interface GridRow {
  person: GridPerson;
  /** One per column, in the same order as `days`. Stable identity matters. */
  cells: DayCell[];
}

export interface GridGroup {
  id: string;
  label: string;
  rows: GridRow[];
}

export interface GridDay {
  /** YYYY-MM-DD */
  key: string;
  dom: number;
  dow: number;
  /** "Mon" — always shown. Which month it is belongs to the period label in
   *  the toolbar; replacing the weekday with it cost the column the one thing
   *  you scan a week by. */
  weekday: string;
}

interface Props {
  days: GridDay[];
  groups: GridGroup[];
  today: string;
  selected: { userId: string; date: string } | null;
  onSelect: (userId: string, date: string) => void;
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  /** Month view: square cells, icon and count only. */
  dense?: boolean;
  /** The page bounds the height here. A scroll container with no maximum
   *  means `sticky top-0` on the date header has nothing to stick inside —
   *  the whole table just grows and the page scrolls past the dates. */
  className?: string;
}

const NAME_W = "min-w-[188px] w-[188px]";

export function AvailabilityGrid({
  days, groups, today, selected, onSelect, collapsed, onToggleGroup, dense, className = "",
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{ u: string; d: string } | null>(null);

  // Only rows you can actually see take part in arrow-key navigation —
  // stepping down into a collapsed section would move focus to nothing.
  const visible = useMemo(
    () => groups.filter((g) => !collapsed.has(g.id)).flatMap((g) => g.rows),
    [groups, collapsed],
  );

  const fallback = visible[0] && days[0] ? { u: visible[0].person.id, d: days[0].key } : null;
  const roving = focus ?? fallback;

  const move = useCallback((u: string, d: string) => {
    setFocus({ u, d });
    // After the tabIndex flip has landed, or the browser refuses the focus.
    requestAnimationFrame(() => {
      scroller.current
        ?.querySelector<HTMLElement>('[data-cell="' + CSS.escape(u + "|" + d) + '"]')
        ?.focus();
    });
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!roving) return;
    const r = visible.findIndex((x) => x.person.id === roving.u);
    const c = days.findIndex((x) => x.key === roving.d);
    if (r < 0 || c < 0) return;

    const go = (dr: number, dc: number) => {
      const nr = Math.min(Math.max(r + dr, 0), visible.length - 1);
      const nc = Math.min(Math.max(c + dc, 0), days.length - 1);
      if (nr === r && nc === c) return;
      e.preventDefault();
      move(visible[nr].person.id, days[nc].key);
    };

    switch (e.key) {
      case "ArrowRight": go(0, 1); break;
      case "ArrowLeft": go(0, -1); break;
      case "ArrowDown": go(1, 0); break;
      case "ArrowUp": go(-1, 0); break;
      case "Home": e.preventDefault(); move(roving.u, days[0].key); break;
      case "End": e.preventDefault(); move(roving.u, days[days.length - 1].key); break;
      default: break;
    }
  }, [roving, visible, days, move]);

  return (
    <div
      ref={scroller}
      onKeyDown={onKeyDown}
      className={`overflow-auto border border-gray-200 dark:border-white/[0.08] rounded-xl bg-white dark:bg-slate-900 ${className}`}
    >
      <table className="border-separate border-spacing-0 w-max text-[12px]">
        <thead>
          <tr>
            <th
              scope="col"
              className={`sticky left-0 top-0 z-40 ${NAME_W} bg-gray-50 dark:bg-slate-900 text-left px-3 py-2 border-b border-r border-gray-200 dark:border-white/[0.08] text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400`}
            >
              Team member
            </th>
            {days.map((d) => (
              <th
                key={d.key}
                scope="col"
                className={`sticky top-0 z-30 px-1 py-1.5 border-b border-gray-200 dark:border-white/[0.08] text-center font-medium ${colTone(d, today)} ${dense ? "w-[42px]" : "w-[112px]"}`}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-80">
                  {d.weekday}
                </span>
                <span className="block text-[12px] font-semibold tabular-nums">{d.dom}</span>
              </th>
            ))}
          </tr>
        </thead>

        {groups.map((g) => {
          const shut = collapsed.has(g.id);
          return (
            <tbody key={g.id}>
              <tr>
                {/* The BUTTON is what sticks, not the cell. A sticky cell that
                    spans every column has its left edge at the far left of the
                    table, so at any horizontal scroll the label was simply cut
                    off — "VIDEOGRAPHERS" read "DEOGRAPHERS". Pinning the label
                    itself keeps it where the names are. */}
                <th
                  scope="colgroup"
                  colSpan={days.length + 1}
                  className="p-0 text-left bg-gray-50/90 dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/[0.08]"
                >
                  <button
                    type="button"
                    onClick={() => onToggleGroup(g.id)}
                    aria-expanded={!shut}
                    className="sticky left-0 z-20 w-fit min-w-[188px] flex items-center gap-1.5 px-3 py-1.5 pr-5 bg-gray-50 dark:bg-slate-800/95 rounded-r-lg text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${shut ? "" : "rotate-90"}`} aria-hidden />
                    {g.label}
                    <span className="font-normal text-gray-400 tabular-nums">({g.rows.length})</span>
                  </button>
                </th>
              </tr>
              {!shut && g.rows.map((row) => (
                <Row
                  key={row.person.id}
                  row={row}
                  days={days}
                  today={today}
                  dense={dense}
                  selectedDate={selected?.userId === row.person.id ? selected.date : null}
                  rovingDate={roving?.u === row.person.id ? roving.d : null}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/**
 * One person's week.
 *
 * `selectedDate` and `rovingDate` are narrowed to this row on purpose —
 * passing the whole selection object would make every row a dependent of it,
 * and clicking one cell would redraw the entire grid.
 */
const Row = memo(function Row({
  row, days, today, dense, selectedDate, rovingDate, onSelect,
}: {
  row: GridRow;
  days: GridDay[];
  today: string;
  dense?: boolean;
  selectedDate: string | null;
  rovingDate: string | null;
  onSelect: (userId: string, date: string) => void;
}) {
  return (
    <tr className="group/row">
      <th
        scope="row"
        className={`sticky left-0 z-10 ${NAME_W} bg-white dark:bg-slate-900 group-hover/row:bg-gray-50 dark:group-hover/row:bg-white/[0.04] text-left px-3 py-1 border-b border-r border-gray-100 dark:border-white/[0.06] font-normal`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={row.person.name} url={row.person.avatarUrl} size={6} />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">{row.person.name}</p>
            {row.person.craft && (
              <p className="text-[10px] text-gray-500 dark:text-slate-400 truncate">{row.person.craft}</p>
            )}
          </div>
        </div>
      </th>
      {days.map((d, i) => (
        <Cell
          key={d.key}
          cell={row.cells[i]}
          day={d}
          today={today}
          dense={dense}
          name={row.person.name}
          selected={selectedDate === d.key}
          roving={rovingDate === d.key}
          onSelect={() => onSelect(row.person.id, d.key)}
          cellKey={`${row.person.id}|${d.key}`}
        />
      ))}
    </tr>
  );
});

function Cell({
  cell, day, today, dense, name, selected, roving, onSelect, cellKey,
}: {
  cell: DayCell; day: GridDay; today: string; dense?: boolean; name: string;
  selected: boolean; roving: boolean; onSelect: () => void; cellKey: string;
}) {
  const tone = toneOf(cell);
  const Icon = TONE_ICON[tone];
  const { head, sub } = cellLabel(cell);
  const label = cellDescription(name, `${day.weekday} ${day.dom}`, cell);

  return (
    <td
      className={`p-0.5 border-b border-gray-100 dark:border-white/[0.06] align-middle group-hover/row:bg-gray-50 dark:group-hover/row:bg-white/[0.04] ${
        day.key === today ? "bg-indigo-50/40 dark:bg-indigo-500/[0.07]" : ""
      }`}
    >
      <button
        type="button"
        data-cell={cellKey}
        tabIndex={roving ? 0 : -1}
        onClick={onSelect}
        aria-label={label}
        aria-pressed={selected}
        title={label}
        className={`w-full rounded-md border text-left transition-colors
          ${TONE_CELL[tone]}
          ${dense ? "h-9 flex items-center justify-center gap-0.5 px-0.5" : "px-1.5 py-1"}
          hover:brightness-[0.97] dark:hover:brightness-125
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900
          ${selected ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
      >
        {dense ? (
          <>
            <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
            {!cell.block && !!cell.load && (
              <span className="text-[10px] font-semibold tabular-nums">{cell.load}</span>
            )}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 min-w-0">
              <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
              <span className="text-[11px] font-medium truncate">{head}</span>
            </span>
            <span className="block text-[10px] opacity-70 truncate leading-tight">
              {sub || " "}
            </span>
          </>
        )}
      </button>
    </td>
  );
}

/** Today wins over the weekend tint; both beat a plain weekday. */
function colTone(d: GridDay, today: string) {
  if (d.key === today) return "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (d.dow === 0 || d.dow === 6) return "bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-slate-500";
  return "bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400";
}
