"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon,
  FolderKanban, CheckSquare, Filter, X, Users,
} from "lucide-react";
import type { CalendarEvent } from "@/types";
import { useCurrentUser } from "@/lib/useCurrentUser";

// ── Constants ────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-slate-400", MEDIUM: "bg-indigo-500", HIGH: "bg-orange-500", URGENT: "bg-red-500",
};

const PRIORITY_BG: Record<string, string> = {
  LOW: "bg-slate-50 text-slate-700 border-slate-200",
  MEDIUM: "bg-indigo-50 text-indigo-700 border-indigo-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
};

const PROJECT_BG: Record<string, string> = {
  ACTIVE: "bg-emerald-500", DRAFT: "bg-slate-400", ON_HOLD: "bg-amber-500",
  COMPLETED: "bg-blue-500", CANCELLED: "bg-red-400",
};

// ── Helpers ──────────────────────────────────────────────────

function getDaysInGrid(year: number, month: number): Date[] {
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date) { return isSameDay(d, new Date()); }

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// ── Types ────────────────────────────────────────────────────

type ViewMode = "month" | "week";

interface DayEvent extends CalendarEvent {
  isProjectStart?: boolean;
  isProjectEnd?: boolean;
}

interface FilterOption { id: string; name: string }

// ── Component ────────────────────────────────────────────────

export default function CalendarPage() {
  const now = new Date();
  const { user: currentUser } = useCurrentUser();

  // State
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Date | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [weekStart, setWeekStart] = useState<Date>(now);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterUserId, setFilterUserId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // Filter options
  const [users, setUsers] = useState<FilterOption[]>([]);
  const [projects, setProjects] = useState<FilterOption[]>([]);
  const [clients, setClients] = useState<FilterOption[]>([]);

  const canFilterByUser = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const activeFilterCount = [filterUserId, filterProjectId, filterClientId, filterPriority].filter(Boolean).length;

  // Fetch filter options
  useEffect(() => {
    if (!canFilterByUser) return;
    fetch("/api/users").then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d.map((u: FilterOption & { role?: string }) => ({ id: u.id, name: u.name })) : []));
  }, [canFilterByUser]);

  useEffect(() => {
    fetch("/api/projects?status=ACTIVE,DRAFT,ON_HOLD").then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d.map((p: FilterOption) => ({ id: p.id, name: p.name })) : []));
    fetch("/api/clients").then(r => r.json()).then(d => setClients(Array.isArray(d) ? d.map((c: FilterOption) => ({ id: c.id, name: c.name })) : []));
  }, []);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month + 1) });
      if (filterUserId) params.set("userId", filterUserId);
      if (filterProjectId) params.set("projectId", filterProjectId);
      if (filterClientId) params.set("clientId", filterClientId);
      if (filterPriority) params.set("priority", filterPriority);

      const res = await fetch(`/api/calendar?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [year, month, filterUserId, filterProjectId, filterClientId, filterPriority]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Navigation
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekStart(now); };
  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const clearFilters = () => { setFilterUserId(""); setFilterProjectId(""); setFilterClientId(""); setFilterPriority(""); };

  // Events for a specific day
  const eventsOnDay = useCallback((day: Date): DayEvent[] => {
    return events.filter((e) => {
      if (e.type === "project") {
        const start = e.date ? new Date(e.date) : null;
        const end = e.endDate ? new Date(e.endDate) : null;
        if (start && isSameDay(start, day)) return true;
        if (end && isSameDay(end, day)) return true;
        if (start && end && day >= start && day <= end) return true;
        return false;
      }
      return isSameDay(new Date(e.date), day);
    }).map((e) => ({
      ...e,
      isProjectStart: e.type === "project" && e.date ? isSameDay(new Date(e.date), day) : false,
      isProjectEnd: e.type === "project" && e.endDate ? isSameDay(new Date(e.endDate), day) : false,
    }));
  }, [events]);

  const days = view === "month" ? getDaysInGrid(year, month) : getWeekDays(weekStart);
  const selectedEvents = selected ? eventsOnDay(selected) : [];

  // Summary counts
  const taskCount = events.filter(e => e.type === "task").length;
  const projectCount = events.filter(e => e.type === "project").length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {taskCount} task{taskCount !== 1 ? "s" : ""} · {projectCount} project{projectCount !== 1 ? "s" : ""}
              {currentUser?.role === "MEMBER" && " (your tasks)"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              <button onClick={() => setView("month")} className={`px-3 py-1.5 font-medium transition-colors ${view === "month" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Month
              </button>
              <button onClick={() => { setView("week"); setWeekStart(now); }} className={`px-3 py-1.5 font-medium transition-colors ${view === "week" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Week
              </button>
            </div>

            {/* Filter button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                activeFilterCount > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>

            {/* Navigation */}
            <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              Today
            </button>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={view === "month" ? prevMonth : prevWeek} className="p-2 hover:bg-gray-50 text-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[140px] text-center">
                {view === "month"
                  ? `${MONTH_NAMES[month]} ${year}`
                  : `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                }
              </span>
              <button onClick={view === "month" ? nextMonth : nextWeek} className="p-2 hover:bg-gray-50 text-gray-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filter bar ────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {canFilterByUser && (
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[140px]"
              >
                <option value="">All Members</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}

            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[140px]"
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[140px]"
            >
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[120px]"
            >
              <option value="">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <div className="flex-1 px-3 sm:px-6 py-4 overflow-auto">
          {error && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              Database not connected. Connect PostgreSQL to see your events.
            </div>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className={`grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden ${view === "week" ? "" : ""}`}>
            {days.map((day, i) => {
              const inMonth = view === "week" || day.getMonth() === month;
              const todayCell = isToday(day);
              const isSelected = selected && isSameDay(day, selected);
              const dayEvents = inMonth ? eventsOnDay(day) : [];
              const taskEvents = dayEvents.filter((e) => e.type === "task");
              const projectEvents = dayEvents.filter((e) => e.type === "project");
              const maxShow = view === "week" ? 8 : 3;
              const overflow = dayEvents.length - maxShow;

              return (
                <div
                  key={i}
                  onClick={() => inMonth && setSelected(selected && isSameDay(day, selected) ? null : day)}
                  className={`bg-white transition-colors ${
                    view === "week" ? "min-h-[200px]" : "min-h-[80px] sm:min-h-[110px]"
                  } p-1.5 sm:p-2 ${
                    inMonth ? "cursor-pointer hover:bg-gray-50" : "opacity-30"
                  } ${isSelected ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/30" : ""}`}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full ${
                      todayCell ? "bg-indigo-600 text-white" : "text-gray-700"
                    }`}>
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">{dayEvents.length}</span>
                    )}
                  </div>

                  {loading && inMonth && <div className="h-4 bg-gray-100 rounded animate-pulse" />}

                  {/* Project bars — compact colored bars */}
                  {projectEvents.slice(0, view === "week" ? 3 : 1).map((e) => (
                    <div key={`p-${e.id}`} className="flex items-center gap-1 mb-0.5" title={`${e.title} (${e.clientName})`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PROJECT_BG[e.status] ?? "bg-gray-400"}`} />
                      <span className="text-[11px] text-gray-600 truncate leading-tight">{e.title}</span>
                    </div>
                  ))}

                  {/* Task dots / items */}
                  {view === "week" ? (
                    // Week view: show task items
                    taskEvents.slice(0, maxShow - projectEvents.length).map((e) => (
                      <div key={`t-${e.id}`} className="flex items-center gap-1 mb-0.5" title={`${e.title} — ${e.projectName}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[e.priority ?? "MEDIUM"]}`} />
                        <span className={`text-[11px] truncate leading-tight ${e.status === "DONE" ? "line-through text-gray-400" : "text-gray-700"}`}>
                          {e.title}
                        </span>
                      </div>
                    ))
                  ) : (
                    // Month view: compact dot row for tasks
                    taskEvents.length > 0 && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {taskEvents.slice(0, 5).map((e) => (
                          <div
                            key={`t-${e.id}`}
                            className={`w-2 h-2 rounded-full ${PRIORITY_DOT[e.priority ?? "MEDIUM"]} ${e.status === "DONE" ? "opacity-30" : ""}`}
                            title={`${e.priority}: ${e.title}`}
                          />
                        ))}
                        {taskEvents.length > 5 && (
                          <span className="text-[9px] text-gray-400 ml-0.5">+{taskEvents.length - 5}</span>
                        )}
                      </div>
                    )
                  )}

                  {/* Overflow */}
                  {overflow > 0 && view === "week" && (
                    <div className="text-[10px] text-gray-400 mt-0.5">+{overflow} more</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Legend:</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Urgent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> High</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> Low</span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Active Project</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> On Hold</span>
          </div>
        </div>

        {/* ── Day detail panel ─────────────────────────────── */}
        {selected && (
          <div className="lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white overflow-y-auto max-h-[50vh] lg:max-h-none">
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalIcon className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">Nothing scheduled</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Projects */}
                  {selectedEvents.filter((e) => e.type === "project").length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Projects</p>
                      {selectedEvents.filter((e) => e.type === "project").map((e) => (
                        <Link key={`p-${e.id}`} href={`/projects/${e.id}`} className="block mb-2">
                          <div className="border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                e.status === "ACTIVE" ? "text-emerald-600" :
                                e.status === "ON_HOLD" ? "text-amber-600" : "text-gray-500"
                              }`}>{e.status}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">{e.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{e.clientName}</p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {e.isProjectStart && "Starts today"}
                              {e.isProjectEnd && "Ends today"}
                              {!e.isProjectStart && !e.isProjectEnd && "Active"}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Tasks */}
                  {selectedEvents.filter((e) => e.type === "task").length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Tasks</p>
                      {selectedEvents.filter((e) => e.type === "task").map((e) => (
                        <Link key={`t-${e.id}`} href={`/projects/${e.projectId}`} className="block mb-2">
                          <div className={`border rounded-xl p-3 hover:shadow-sm transition-all ${PRIORITY_BG[e.priority ?? "MEDIUM"]}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <CheckSquare className="w-3 h-3" />
                                <span className="text-[10px] font-semibold uppercase">{e.priority}</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                e.status === "DONE" ? "bg-emerald-100 text-emerald-700" :
                                e.status === "BLOCKED" ? "bg-red-100 text-red-700" :
                                e.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>{e.status?.replace("_", " ")}</span>
                            </div>
                            <p className={`text-sm font-medium ${e.status === "DONE" ? "line-through opacity-60" : ""}`}>
                              {e.title}
                            </p>
                            <p className="text-xs opacity-70 mt-0.5">{e.projectName}</p>
                            {e.assignees && e.assignees.length > 0 && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <Users className="w-3 h-3 opacity-50" />
                                <span className="text-[10px] opacity-60">{e.assignees.join(", ")}</span>
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
