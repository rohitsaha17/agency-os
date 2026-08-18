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
}

export function MonthGrid({
  view, year, month, weekStart, selected, loading,
  onDayClick, cellCount, renderCell, renderStrip,
}: MonthGridProps) {
  const days = view === "month" ? getDaysInGrid(year, month) : getWeekDays(weekStart ?? new Date());

  return (
    <>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
        {days.map((day, i) => {
          const inMonth = view === "week" || day.getMonth() === month;
          const todayCell = isToday(day);
          const isSelected = !!selected && isSameDay(day, selected);
          const count = inMonth ? cellCount?.(day) ?? 0 : 0;

          return (
            <div
              key={i}
              onClick={() => inMonth && onDayClick?.(day)}
              className={`bg-white transition-colors ${
                view === "week" ? "min-h-[200px]" : "min-h-[80px] sm:min-h-[110px]"
              } p-1.5 sm:p-2 ${
                inMonth ? "cursor-pointer hover:bg-gray-50" : "opacity-30"
              } ${isSelected ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/30" : ""}`}
            >
              {renderStrip?.(day, { inMonth })}

              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span className={`w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full ${
                  todayCell ? "bg-indigo-600 text-white" : "text-gray-700"
                }`}>
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <span className="text-[10px] text-gray-400 font-medium">{count}</span>
                )}
              </div>

              {loading && inMonth && <div className="h-4 bg-gray-100 rounded animate-pulse" />}

              {inMonth && renderCell(day, { inMonth, today: todayCell, selected: isSelected })}
            </div>
          );
        })}
      </div>
    </>
  );
}
