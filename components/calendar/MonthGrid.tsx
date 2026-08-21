"use client";

/**
 * Shared month/week calendar grid (extracted from /calendar in Phase 3 —
 * docs/V2_CONTEXT.md Prime Directive: one grid component, reused by the
 * master calendar, client content calendars, and My Calendar).
 *
 * The grid renders the weekday header row + day cells (day number, count
 * badge, optional loading shimmer). Each consumer supplies the cell BODY
 * via `renderCell`, so different calendars are different lenses over the
 * same grid.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function getDaysInGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let i = 0; i < firstDay.getDay(); i++) {
    days.push(new Date(year, month, -firstDay.getDay() + i + 1));
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    days.push(new Date(last.getTime() + 86400000));
  }
  return days;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d: Date) { return isSameDay(d, new Date()); }

export function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export interface MonthGridProps {
  /** Month view: computed grid for year/month. Week view: 7 days of weekStart. */
  view: "month" | "week";
  year: number;
  month: number; // 0-based
  weekStart?: Date;
  selected?: Date | null;
  loading?: boolean;
  onDayClick?: (day: Date) => void;
  /** Count badge shown top-right of a cell (0/undefined hides it). */
  cellCount?: (day: Date) => number;
  /** Cell body below the day number. */
  renderCell: (day: Date, ctx: { inMonth: boolean; today: boolean; selected: boolean }) => React.ReactNode;
  /** Optional full-width strip ABOVE the day number (event banners). */
  renderStrip?: (day: Date, ctx: { inMonth: boolean }) => React.ReactNode;
  /**
   * Stretch the grid to its container instead of using fixed row heights,
   * so a whole month fits the viewport with no page scroll. The parent must
   * have a resolved height.
   */
  fill?: boolean;
}

export function MonthGrid({
  view, year, month, weekStart, selected, loading,
  onDayClick, cellCount, renderCell, renderStrip, fill,
}: MonthGridProps) {
  const days = view === "month" ? getDaysInGrid(year, month) : getWeekDays(weekStart ?? new Date());
  const rows = days.length / 7;

  return (
    <div className={`bg-white dark:bg-slate-900 ${fill ? "flex flex-col h-full min-h-0" : ""}`}>
      {/* Weekday headers. Weekends are dimmed here too, so the tinted
          columns below have something to line up with. */}
      <div className="grid grid-cols-7 flex-shrink-0 border-b border-gray-200 dark:border-white/[0.08] bg-gradient-to-b from-gray-50 to-white dark:from-white/[0.04] dark:to-transparent">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-semibold uppercase tracking-[0.08em] py-2.5 ${
              i === 0 || i === 6
                ? "text-gray-400 dark:text-slate-500"
                : "text-gray-500 dark:text-slate-400"
            }`}
          >
            <span className="sm:hidden">{d.slice(0, 1)}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      {/* Day grid. The gap colour IS the gridline — one pixel of the
          container showing through between cells. */}
      <div
        className={`grid grid-cols-7 gap-px cal-gridlines ${fill ? "flex-1 min-h-0" : ""}`}
        style={fill ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : undefined}
      >
        {days.map((day, i) => {
          const inMonth = view === "week" || day.getMonth() === month;
          const todayCell = isToday(day);
          const isSelected = !!selected && isSameDay(day, selected);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const count = inMonth ? cellCount?.(day) ?? 0 : 0;
          // Google-style: the 1st shows its month name for orientation
          const label = day.getDate() === 1
            ? `1 ${MONTH_NAMES[day.getMonth()].slice(0, 3)}`
            : String(day.getDate());

          // Cell surface, in priority order: today wins, then selection,
          // then weekend tint, then the plain in-month face. Days from the
          // neighbouring month are recessed and hatched.
          const surface = !inMonth
            ? "cal-cell-muted"
            : todayCell
              ? "cal-cell cal-cell-today"
              : isWeekend
                ? "cal-cell cal-cell-weekend"
                : "cal-cell bg-white dark:bg-slate-900";

          return (
            <div
              key={i}
              onClick={() => inMonth && onDayClick?.(day)}
              className={`relative transition-colors duration-150 flex flex-col ${surface} ${
                inMonth ? "cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-500/[0.07]" : ""
              } ${
                fill
                  ? "min-h-0 overflow-hidden"
                  : view === "week" ? "min-h-[200px]" : "min-h-[80px] sm:min-h-[110px]"
              } px-1.5 pb-1 pt-1 ${
                isSelected
                  ? "ring-2 ring-inset ring-indigo-500 dark:ring-indigo-400 z-10"
                  : ""
              }`}
            >
              {/* Day number — a fixed header row, ALWAYS first. Event strips
                  render in the lane below it, so every date number in a row
                  sits at the same height whether or not that day has an
                  event (v3 Phase 0, defect 1). */}
              <div className="h-6 flex items-center justify-center relative flex-shrink-0">
                <span className={`h-6 min-w-6 px-1.5 flex items-center justify-center text-xs font-semibold rounded-full tabular-nums transition-shadow ${
                  todayCell
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 ring-2 ring-white/70 dark:ring-slate-900"
                    : inMonth
                      ? "text-gray-700 dark:text-slate-200"
                      : "text-gray-400 dark:text-slate-600 font-medium"
                }`}>
                  {label}
                </span>
                {count > 0 && (
                  // Was text-gray-300, which was invisible against a white
                  // cell and pointless against a dark one.
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-semibold tabular-nums bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-slate-400">
                    {count}
                  </span>
                )}
              </div>

              {/* Reserved strip lane (all-day event banners) */}
              <div className="flex-shrink-0">{renderStrip?.(day, { inMonth })}</div>

              {loading && inMonth && (
                <div className="h-4 bg-gray-100 dark:bg-white/[0.06] rounded animate-pulse" />
              )}

              {/* Cell body scrolls inside its own cell so the grid never
                  pushes the page taller than the viewport. */}
              <div data-scrollable className={fill ? "flex-1 min-h-0 overflow-y-auto" : ""}>
                {inMonth && renderCell(day, { inMonth, today: todayCell, selected: isSelected })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
