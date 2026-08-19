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
    <div className={`bg-white ${fill ? "flex flex-col h-full min-h-0" : ""}`}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 flex-shrink-0 border-b border-gray-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className={`grid grid-cols-7 gap-px bg-gray-100 ${fill ? "flex-1 min-h-0" : ""}`}
        style={fill ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : undefined}
      >
        {days.map((day, i) => {
          const inMonth = view === "week" || day.getMonth() === month;
          const todayCell = isToday(day);
          const isSelected = !!selected && isSameDay(day, selected);
          const count = inMonth ? cellCount?.(day) ?? 0 : 0;
          // Google-style: the 1st shows its month name for orientation
          const label = day.getDate() === 1
            ? `1 ${MONTH_NAMES[day.getMonth()].slice(0, 3)}`
            : String(day.getDate());

          return (
            <div
              key={i}
              onClick={() => inMonth && onDayClick?.(day)}
              className={`transition-colors flex flex-col ${
                inMonth ? "bg-white cursor-pointer hover:bg-indigo-50/30" : "bg-gray-50/70"
              } ${
                fill
                  ? "min-h-0 overflow-hidden"
                  : view === "week" ? "min-h-[200px]" : "min-h-[80px] sm:min-h-[110px]"
              } px-1.5 pb-1 pt-1 ${
                isSelected ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/40" : ""
              }`}
            >
              {/* Day number — a fixed header row, ALWAYS first. Event strips
                  render in the lane below it, so every date number in a row
                  sits at the same height whether or not that day has an
                  event (v3 Phase 0, defect 1). */}
              <div className="h-6 flex items-center justify-center relative flex-shrink-0">
                <span className={`h-6 min-w-6 px-1.5 flex items-center justify-center text-xs font-medium rounded-full ${
                  todayCell ? "bg-indigo-600 text-white" :
                  inMonth ? "text-gray-700" : "text-gray-400"
                }`}>
                  {label}
                </span>
                {count > 0 && (
                  <span className="absolute right-0 text-[10px] text-gray-300 font-medium">{count}</span>
                )}
              </div>

              {/* Reserved strip lane (all-day event banners) */}
              <div className="flex-shrink-0">{renderStrip?.(day, { inMonth })}</div>

              {loading && inMonth && <div className="h-4 bg-gray-100 rounded animate-pulse" />}

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
