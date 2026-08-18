"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon,
  FolderKanban, CheckSquare, Filter, X, Users, Plus, Zap, PartyPopper,
} from "lucide-react";
import type { CalendarEvent, ContentStatus, Task } from "@/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@/components/ui/Button";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MonthGrid, MONTH_NAMES, isSameDay } from "@/components/calendar/MonthGrid";
import { CONTENT_STATUS_META } from "@/components/content/ContentCalendarTab";

// ── Constants (legacy task/project layers) ───────────────────

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

const EVENT_KIND_STYLE: Record<string, string> = {
  FESTIVAL: "bg-amber-100 text-amber-800 border-amber-200",
  CAMPAIGN: "bg-purple-100 text-purple-800 border-purple-200",
  SHOOT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  INTERNAL: "bg-slate-100 text-slate-700 border-slate-200",
  OTHER: "bg-gray-100 text-gray-700 border-gray-200",
};

const CLIENT_COLORS = [
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
];

// ── Types ────────────────────────────────────────────────────

type ViewMode = "month" | "week";
type ColorBy = "client" | "type" | "status";

interface DayEvent extends CalendarEvent {
  isProjectStart?: boolean;
  isProjectEnd?: boolean;
}

interface MasterItem {
  id: string;
  clientId: string;
  date: string;
  topic: string;
  status: ContentStatus;
  isExtra: boolean;
  isAdHoc: boolean;
  client: { id: string; name: string };
  creativeType: { id: string; name: string; icon: string | null; color: string | null };
  tasks: { id: string; status: string; assignees: { user: { id: string; name: string } }[] }[];
}

interface OrgEvent {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  kind: string;
  isAdHoc: boolean;
  notes: string | null;
  reminderDaysBefore: number | null;
  client: { id: string; name: string } | null;
}

interface FilterOption { id: string; name: string }

// ── Component ────────────────────────────────────────────────

export default function CalendarPage() {
  const now = new Date();
  const { user: currentUser } = useCurrentUser();

  // State
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [items, setItems] = useState<MasterItem[]>([]);
  const [orgEvents, setOrgEvents] = useState<OrgEvent[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]); // legacy layers
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [weekStart, setWeekStart] = useState<Date>(now);
  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [showTasks, setShowTasks] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [shootTaskFor, setShootTaskFor] = useState<OrgEvent | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterUserId, setFilterUserId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [extraOnly, setExtraOnly] = useState(false);
  const [adHocOnly, setAdHocOnly] = useState(false);

  // Filter options
  const [users, setUsers] = useState<FilterOption[]>([]);
  const [projects, setProjects] = useState<FilterOption[]>([]);
  const [clients, setClients] = useState<FilterOption[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string; icon: string | null }[]>([]);

  const canFilterByUser = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER" || currentUser?.role === "OWNER";
  const activeFilterCount = [
    filterUserId, filterProjectId, filterClientId, filterPriority,
    filterTypeId, filterStatus, extraOnly ? "1" : "", adHocOnly ? "1" : "",
  ].filter(Boolean).length;

  useEffect(() => {
    if (canFilterByUser) {
      fetch("/api/users").then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d.map((u: FilterOption) => ({ id: u.id, name: u.name })) : []));
    }
    fetch("/api/projects?status=ACTIVE,DRAFT,ON_HOLD").then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d.map((p: FilterOption) => ({ id: p.id, name: p.name })) : []));
    fetch("/api/clients").then(r => r.json()).then(d => setClients(Array.isArray(d) ? d.map((c: FilterOption) => ({ id: c.id, name: c.name })) : []));
    fetch("/api/creative-types").then(r => r.json()).then(d => { if (Array.isArray(d)) setTypes(d); });
  }, [canFilterByUser]);

  // Master content + events fetch
  const fetchMaster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month + 1) });
      if (filterClientId) params.set("clientId", filterClientId);
      if (filterProjectId) params.set("projectId", filterProjectId);
      if (filterTypeId) params.set("creativeTypeId", filterTypeId);
      if (filterStatus) params.set("status", filterStatus);
      if (filterUserId) params.set("assigneeId", filterUserId);
      if (extraOnly) params.set("extraOnly", "1");
      if (adHocOnly) params.set("adHocOnly", "1");
      const res = await fetch(`/api/master-calendar?${params}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items ?? []);
        setOrgEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, filterClientId, filterProjectId, filterTypeId, filterStatus, filterUserId, extraOnly, adHocOnly]);

  useEffect(() => { fetchMaster(); }, [fetchMaster]);

  // Legacy task/project layers (only when toggled on)
  const fetchLegacy = useCallback(async () => {
    if (!showTasks && !showProjects) { setEvents([]); return; }
    const params = new URLSearchParams({ year: String(year), month: String(month + 1) });
    if (filterUserId) params.set("userId", filterUserId);
    if (filterProjectId) params.set("projectId", filterProjectId);
    if (filterClientId) params.set("clientId", filterClientId);
    if (filterPriority) params.set("priority", filterPriority);
    const res = await fetch(`/api/calendar?${params}`);
    const data = await res.json();
    if (res.ok) setEvents(Array.isArray(data) ? data : []);
  }, [showTasks, showProjects, year, month, filterUserId, filterProjectId, filterClientId, filterPriority]);

  useEffect(() => { fetchLegacy(); }, [fetchLegacy]);

  // Navigation
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekStart(now); };
  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const clearFilters = () => {
    setFilterUserId(""); setFilterProjectId(""); setFilterClientId(""); setFilterPriority("");
    setFilterTypeId(""); setFilterStatus(""); setExtraOnly(false); setAdHocOnly(false);
  };

  const clientColor = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c, i) => map.set(c.id, CLIENT_COLORS[i % CLIENT_COLORS.length]));
    return map;
  }, [clients]);

  const chipClass = (i: MasterItem): string => {
    if (colorBy === "client") return clientColor.get(i.clientId) ?? CLIENT_COLORS[0];
    if (colorBy === "type") return "border text-gray-700";
    return CONTENT_STATUS_META[i.status].chip;
  };

  const itemsOn = useCallback((day: Date) => items.filter((i) => isSameDay(new Date(i.date), day)), [items]);
  const eventsOn = useCallback((day: Date) => orgEvents.filter((e) => {
    const start = new Date(e.date);
    const end = e.endDate ? new Date(e.endDate) : start;
    return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && day <= end;
  }), [orgEvents]);

  const legacyOn = useCallback((day: Date): DayEvent[] => {
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

  const selectedItems = selected ? itemsOn(selected) : [];
  const selectedEvents = selected ? eventsOn(selected) : [];
  const selectedLegacy = selected ? legacyOn(selected) : [];
  const groupedByClient = useMemo(() => {
    const map = new Map<string, MasterItem[]>();
    for (const i of selectedItems) {
      const key = i.client.name;
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return [...map.entries()];
  }, [selectedItems]);

  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Master Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {items.length} content item{items.length !== 1 ? "s" : ""} across all clients
              {currentUser?.role === "MEMBER" && " (your linked work)"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Color by */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(["status", "client", "type"] as ColorBy[]).map((c) => (
                <button key={c} onClick={() => setColorBy(c)}
                  className={`px-2.5 py-1.5 font-medium capitalize transition-colors ${colorBy === c ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                  {c}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              <button onClick={() => setView("month")} className={`px-3 py-1.5 font-medium transition-colors ${view === "month" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Month
              </button>
              <button onClick={() => { setView("week"); setWeekStart(now); }} className={`px-3 py-1.5 font-medium transition-colors ${view === "week" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Week
              </button>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                activeFilterCount > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>

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
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddEventOpen(true)}>
              Add Event
            </Button>
          </div>
        </div>

        {/* ── Filter bar ────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {canFilterByUser && (
              <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
                <option value="">All Assignees</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterTypeId} onChange={(e) => setFilterTypeId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
              <option value="">All Types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ""}{t.name}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
              <option value="">All Statuses</option>
              {Object.entries(CONTENT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={extraOnly} onChange={(e) => setExtraOnly(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              Extra only
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={adHocOnly} onChange={(e) => setAdHocOnly(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              Ad-hoc only
            </label>

            <span className="mx-1 text-gray-200">|</span>

            {/* Legacy layers */}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <CheckSquare className="w-3 h-3" /> Show tasks
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showProjects} onChange={(e) => setShowProjects(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <FolderKanban className="w-3 h-3" /> Show projects
            </label>
            {showTasks && (
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[110px]">
                <option value="">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            )}

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
          <MonthGrid
            view={view}
            year={year}
            month={month}
            weekStart={weekStart}
            selected={selected}
            loading={loading}
            onDayClick={(day) => setSelected(selected && isSameDay(day, selected) ? null : day)}
            cellCount={(day) => itemsOn(day).length + (showTasks || showProjects ? legacyOn(day).length : 0)}
            renderStrip={(day) => {
              const evs = eventsOn(day);
              if (evs.length === 0) return null;
              return (
                <div className="-mx-1.5 -mt-1.5 sm:-mx-2 sm:-mt-2 mb-1">
                  {evs.slice(0, 2).map((e) => (
                    <div key={e.id}
                      title={e.title + (e.client ? ` (${e.client.name})` : "")}
                      className={`px-1.5 py-0.5 text-[9px] font-semibold truncate border-b ${EVENT_KIND_STYLE[e.kind]} ${e.isAdHoc ? "border-dashed" : ""}`}>
                      {e.kind === "FESTIVAL" && "🎉 "}
                      {e.isAdHoc && "⚡ "}
                      {e.title}
                    </div>
                  ))}
                </div>
              );
            }}
            renderCell={(day) => {
              const dayItems = itemsOn(day);
              const legacy = (showTasks || showProjects) ? legacyOn(day) : [];
              const taskEvents = showTasks ? legacy.filter((e) => e.type === "task") : [];
              const projectEvents = showProjects ? legacy.filter((e) => e.type === "project") : [];
              const maxShow = view === "week" ? 7 : 3;
              return (
                <>
                  {/* Project bars (legacy layer) */}
                  {projectEvents.slice(0, 1).map((e) => (
                    <div key={`p-${e.id}`} className="flex items-center gap-1 mb-0.5" title={`${e.title} (${e.clientName})`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PROJECT_BG[e.status] ?? "bg-gray-400"}`} />
                      <span className="text-[11px] text-gray-600 truncate leading-tight">{e.title}</span>
                    </div>
                  ))}

                  {/* Content chips */}
                  {dayItems.slice(0, maxShow).map((i) => {
                    const meta = CONTENT_STATUS_META[i.status];
                    return (
                      <Link key={i.id} href={`/clients/${i.clientId}?tab=content`}
                        onClick={(e) => e.stopPropagation()}
                        title={`${i.client.name} — ${i.creativeType.name}: ${i.topic} (${meta.label})`}
                        className={`flex items-center gap-1 mb-0.5 px-1 py-0.5 rounded border ${chipClass(i)} ${i.isAdHoc ? "border-dashed" : ""}`}
                        style={colorBy === "type" && i.creativeType.color ? { backgroundColor: `${i.creativeType.color}18`, borderColor: `${i.creativeType.color}55` } : undefined}
                      >
                        <span className="w-3.5 h-3.5 rounded-full bg-white/70 text-[7px] font-bold flex items-center justify-center flex-shrink-0">
                          {initials(i.client.name)}
                        </span>
                        <span className="text-[10px] flex-shrink-0">{i.creativeType.icon ?? "✨"}</span>
                        <span className="text-[10px] truncate leading-tight flex-1">{i.topic}</span>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                        {i.isAdHoc && <Zap className="w-2 h-2 text-amber-500 flex-shrink-0" />}
                      </Link>
                    );
                  })}
                  {dayItems.length > maxShow && (
                    <span className="text-[9px] text-gray-400">+{dayItems.length - maxShow} more</span>
                  )}

                  {/* Task dots (legacy layer) */}
                  {taskEvents.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {taskEvents.slice(0, 5).map((e) => (
                        <div key={`t-${e.id}`}
                          className={`w-2 h-2 rounded-full ${PRIORITY_DOT[e.priority ?? "MEDIUM"]} ${e.status === "DONE" ? "opacity-30" : ""}`}
                          title={`${e.priority}: ${e.title}`} />
                      ))}
                      {taskEvents.length > 5 && <span className="text-[9px] text-gray-400 ml-0.5">+{taskEvents.length - 5}</span>}
                    </div>
                  )}
                </>
              );
            }}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Status:</span>
            {(["PLANNED", "IN_REVIEW", "CLIENT_APPROVED", "POSTED", "MISSED"] as ContentStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${CONTENT_STATUS_META[s].dot}`} /> {CONTENT_STATUS_META[s].label}
              </span>
            ))}
            <span className="mx-1 text-gray-300">|</span>
            <span className="flex items-center gap-1"><PartyPopper className="w-3 h-3 text-amber-500" /> Event strip</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> Ad-hoc (dashed)</span>
          </div>
        </div>

        {/* ── Day detail panel — grouped by client ─────────── */}
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

              {/* Events */}
              {selectedEvents.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Events</p>
                  {selectedEvents.map((e) => (
                    <div key={e.id} className={`border rounded-xl p-3 mb-2 ${EVENT_KIND_STYLE[e.kind]} ${e.isAdHoc ? "border-dashed" : ""}`}>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {e.kind === "FESTIVAL" && "🎉"} {e.isAdHoc && <Zap className="w-3 h-3" />} {e.title}
                      </p>
                      {e.client && <p className="text-xs opacity-70 mt-0.5">{e.client.name}</p>}
                      {e.notes && <p className="text-xs opacity-70 mt-1">{e.notes}</p>}
                      {e.kind === "SHOOT" && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => setShootTaskFor(e)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-white/70 rounded-lg hover:bg-white">
                            Create task
                          </button>
                          {/* TODO(phase-9): "Create booking" hook lands with the booking calendar */}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedItems.length === 0 && selectedEvents.length === 0 && selectedLegacy.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalIcon className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">Nothing scheduled</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Content grouped by client */}
                  {groupedByClient.map(([clientName, clientItems]) => (
                    <div key={clientName}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{clientName}</p>
                      {clientItems.map((i) => {
                        const meta = CONTENT_STATUS_META[i.status];
                        return (
                          <Link key={i.id} href={`/clients/${i.clientId}?tab=content`} className="block mb-2">
                            <div className={`border rounded-xl p-3 hover:shadow-sm transition-all ${meta.chip} ${i.isAdHoc ? "border-dashed" : ""}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs">{i.creativeType.icon ?? "✨"} {i.creativeType.name}</span>
                                <span className="text-[10px] font-semibold uppercase">{meta.label}</span>
                              </div>
                              <p className="text-sm font-medium">{i.topic}</p>
                              {i.tasks.length > 0 && (
                                <p className="text-[10px] opacity-60 mt-1 flex items-center gap-1">
                                  <Users className="w-2.5 h-2.5" />
                                  {i.tasks.flatMap((t) => t.assignees.map((a) => a.user.name)).join(", ") || "unassigned"}
                                </p>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ))}

                  {/* Legacy layers in panel */}
                  {showProjects && selectedLegacy.filter((e) => e.type === "project").map((e) => (
                    <Link key={`p-${e.id}`} href={`/projects/${e.id}`} className="block">
                      <div className="border border-gray-200 rounded-xl p-3 hover:border-indigo-300 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-[10px] font-semibold uppercase text-gray-500">{e.status}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{e.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{e.clientName}</p>
                      </div>
                    </Link>
                  ))}
                  {showTasks && selectedLegacy.filter((e) => e.type === "task").map((e) => (
                    <Link key={`t-${e.id}`} href={`/projects/${e.projectId}`} className="block">
                      <div className={`border rounded-xl p-3 transition-all ${PRIORITY_BG[e.priority ?? "MEDIUM"]}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckSquare className="w-3 h-3" />
                          <span className="text-[10px] font-semibold uppercase">{e.priority}</span>
                        </div>
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs opacity-70 mt-0.5">{e.projectName}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Event dialog */}
      {addEventOpen && (
        <AddEventDialog
          clients={clients}
          onClose={() => setAddEventOpen(false)}
          onSaved={() => { setAddEventOpen(false); fetchMaster(); }}
        />
      )}

      {/* SHOOT event → create task, prefilled */}
      {shootTaskFor && (
        <TaskModal
          global
          prefill={{
            topic: shootTaskFor.title,
            title: `Shoot: ${shootTaskFor.title}`,
            content: shootTaskFor.notes ?? "",
            clientId: shootTaskFor.client?.id ?? "",
            dueDate: shootTaskFor.date.slice(0, 10),
          }}
          onClose={() => setShootTaskFor(null)}
          onSaved={() => setShootTaskFor(null)}
        />
      )}
    </div>
  );
}

// ── Add Event dialog ─────────────────────────────────────────

function AddEventDialog({
  clients, onClose, onSaved,
}: {
  clients: FilterOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "", kind: "CAMPAIGN", date: new Date().toISOString().slice(0, 10),
    endDate: "", clientId: "", reminderDaysBefore: "7", isAdHoc: false, notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          endDate: form.endDate || null,
          clientId: form.clientId || null,
          reminderDaysBefore: form.reminderDaysBefore || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Event</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
              <input autoFocus value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Diwali campaign kickoff"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Kind</label>
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {["FESTIVAL", "CAMPAIGN", "SHOOT", "INTERNAL", "OTHER"].map((k) => (
                  <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Client (optional)</label>
              <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Org-wide</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">End date (optional)</label>
              <input type="date" value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Remind (days before)</label>
              <input type="number" min="0" value={form.reminderDaysBefore}
                onChange={(e) => setForm((f) => ({ ...f, reminderDaysBefore: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.isAdHoc}
                  onChange={(e) => setForm((f) => ({ ...f, isAdHoc: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600" />
                Ad-hoc <Zap className="w-3 h-3 text-amber-500" />
              </label>
            </div>
          </div>
          <textarea value={form.notes} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Add Event</Button>
        </div>
      </div>
    </div>
  );
}
