"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, FolderKanban } from "lucide-react";
import type { CalendarEvent } from "@/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Pad before
  for (let i = 0; i < firstDay.getDay(); i++) {
    days.push(new Date(year, month, -firstDay.getDay() + i + 1));
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad after to complete the grid (6 rows = 42 cells max)
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    days.push(new Date(last.getTime() + 86400000));
  }
  return days;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function isToday(d: Date) { return isSameDay(d, new Date()); }

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600 border-gray-200",
  MEDIUM: "bg-indigo-50 text-indigo-700 border-indigo-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-gray-100 text-gray-600",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-600",
};

interface DayEvent extends CalendarEvent {
  isProjectStart?: boolean;
  isProjectEnd?: boolean;
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${month + 1}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const today = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const days = getDaysInGrid(year, month);

  const eventsOnDay = (day: Date): DayEvent[] => {
    return events.filter((e) => {
      const eventDate = new Date(e.date);
      if (e.type === "project") {
        const start = e.date ? new Date(e.date) : null;
        const end   = e.endDate ? new Date(e.endDate) : null;
        if (start && isSameDay(start, day)) return true;
        if (end   && isSameDay(end, day)) return true;
        if (start && end && day >= start && day <= end) return true;
        return false;
      }
      return isSameDay(eventDate, day);
    }).map((e) => ({
      ...e,
      isProjectStart: e.type === "project" && e.date ? isSameDay(new Date(e.date), day) : false,
      isProjectEnd:   e.type === "project" && e.endDate ? isSameDay(new Date(e.endDate), day) : false,
    }));
  };

  const selectedEvents = selected ? eventsOnDay(selected) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">Task deadlines and project timelines</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={today} className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
              Today
            </button>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-50 transition-colors text-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[160px] text-center">
                {MONTH_NAMES[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-50 transition-colors text-gray-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Calendar grid */}
        <div className="flex-1 px-3 sm:px-6 py-4 overflow-auto">
          {error && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              Database not connected. Connect PostgreSQL to see your events.
            </div>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
            {days.map((day, i) => {
              const inMonth = day.getMonth() === month;
              const todayCell = isToday(day);
              const isSelected = selected && isSameDay(day, selected);
              const dayEvents = inMonth ? eventsOnDay(day) : [];
              const taskEvents = dayEvents.filter((e) => e.type === "task");
              const projectEvents = dayEvents.filter((e) => e.type === "project");

              return (
                <div
                  key={i}
                  onClick={() => inMonth && setSelected(isSameDay(day, selected ?? new Date(0)) ? null : day)}
                  className={`bg-white min-h-[60px] sm:min-h-[100px] p-1 sm:p-2 transition-colors ${
                    inMonth ? "cursor-pointer hover:bg-gray-50" : "opacity-40 cursor-default"
                  } ${isSelected ? "ring-2 ring-inset ring-indigo-400" : ""}`}
                >
                  {/* Day number */}
                  <div className={`w-7 h-7 flex items-center justify-center text-sm font-medium mb-1 rounded-full ${
                    todayCell ? "bg-indigo-600 text-white" : "text-gray-700"
                  }`}>
                    {day.getDate()}
                  </div>

                  {loading && inMonth && (
                    <div className="space-y-1">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </div>
                  )}

                  {/* Project timeline bars */}
                  {projectEvents.slice(0, 2).map((e) => (
                    <div
                      key={`p-${e.id}`}
                      title={`${e.title} (${e.clientName})`}
                      className={`text-xs px-1 sm:px-1.5 py-0.5 rounded mb-0.5 truncate ${PROJECT_STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      <span className="hidden sm:inline">{e.isProjectStart ? "▶ " : e.isProjectEnd ? "◀ " : "— "}</span>{e.title}
                    </div>
                  ))}

                  {/* Task events */}
                  {taskEvents.slice(0, 3).map((e) => (
                    <div
                      key={`t-${e.id}`}
                      title={`${e.title} — ${e.projectName}`}
                      className={`text-xs px-1 sm:px-1.5 py-0.5 rounded mb-0.5 truncate border ${PRIORITY_COLORS[e.priority ?? "MEDIUM"] ?? ""}`}
                    >
                      <span className="hidden sm:inline">{e.title}</span>
                      <span className="sm:hidden">·</span>
                    </div>
                  ))}

                  {/* Overflow indicator */}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-400 mt-0.5">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selected && (
          <div className="lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white p-4 sm:p-5 overflow-y-auto max-h-[50vh] lg:max-h-none">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              {selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h3>

            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalIcon className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">Nothing scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEvents.filter((e) => e.type === "project").map((e) => (
                  <Link key={`p-${e.id}`} href={`/projects/${e.id}`}>
                    <div className="border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs font-semibold text-indigo-700">Project</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{e.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{e.clientName}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {e.isProjectStart && "Starts today"}
                        {e.isProjectEnd && "Ends today"}
                        {!e.isProjectStart && !e.isProjectEnd && "Active"}
                      </p>
                    </div>
                  </Link>
                ))}

                {selectedEvents.filter((e) => e.type === "task").map((e) => (
                  <Link key={`t-${e.id}`} href={`/projects/${e.projectId}`}>
                    <div className="border border-gray-200 rounded-xl p-3 hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[e.priority ?? "MEDIUM"]}`}>
                          {e.priority}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.status === "DONE" ? "bg-emerald-50 text-emerald-700" :
                          e.status === "BLOCKED" ? "bg-red-50 text-red-700" :
                          "bg-blue-50 text-blue-700"
                        }`}>{e.status}</span>
                      </div>
                      <p className={`text-sm font-medium ${e.status === "DONE" ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {e.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{e.projectName} · {e.clientName}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
