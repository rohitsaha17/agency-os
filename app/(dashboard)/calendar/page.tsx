"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon,
  FolderKanban, CheckSquare, Filter, X, Users, Plus, Zap, PartyPopper, Search,
} from "lucide-react";
import type { CalendarEvent, ContentStatus, Task } from "@/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MonthGrid, MONTH_NAMES, isSameDay } from "@/components/calendar/MonthGrid";
import { useWheelPeriod } from "@/components/calendar/useWheelPeriod";
import { CONTENT_STATUS_META, contentStatusChip } from "@/components/content/ContentCalendarTab";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { Select } from "@/components/ui/Select";
import { todayKey } from "@/lib/date-key";

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


/** One labelled checkbox in the filter rail. */
function Toggle({ checked, onChange, label, icon }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; icon?: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-0.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/40" />
      {icon}
      <span>{label}</span>
    </label>
  );
}

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
  /** The brief. Empty means the slot is reserved, not yet planned. */
  description: string | null;
  status: ContentStatus;
  isExtra: boolean;
  isAdHoc: boolean;
  client: { id: string; name: string };
  project: { id: string; name: string } | null;
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

  // v3 Phase 0 (defect 4): clicking a content chip opens THAT item in the
  // side panel instead of navigating away to the client page.
  const [selectedItem, setSelectedItem] = useState<MasterItem | null>(null);
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
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [extraOnly, setExtraOnly] = useState(false);
  const [adHocOnly, setAdHocOnly] = useState(false);

  // Filter options
  const [users, setUsers] = useState<FilterOption[]>([]);
  const [projects, setProjects] = useState<(FilterOption & { clientId?: string })[]>([]);
  const [clients, setClients] = useState<FilterOption[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string; icon: string | null }[]>([]);

  const canFilterByUser = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER" || currentUser?.role === "OWNER";
  const activeFilterCount = [
    filterUserId, filterProjectId, filterClientId, filterPriority,
    filterTypeId, filterStatus, extraOnly ? "1" : "", adHocOnly ? "1" : "",
    search.trim(),
  ].filter(Boolean).length;

  useEffect(() => {
    if (canFilterByUser) {
      fetch("/api/users").then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d.map((u: FilterOption) => ({ id: u.id, name: u.name })) : []));
    }
    // clientId is kept, not dropped: picking a project should fill in the
    // client it belongs to, and picking a client should narrow the projects.
    fetch("/api/projects?status=ACTIVE,DRAFT,ON_HOLD").then(r => r.json()).then(d => setProjects(
      Array.isArray(d) ? d.map((p: { id: string; name: string; clientId?: string }) => ({
        id: p.id, name: p.name, clientId: p.clientId ?? "",
      })) : [],
    ));
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
  const goToday = () => {
    setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekStart(now);
    setSelectedItem(null); setSelected(now);
  };
  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  /**
   * Keep the day panel inside the month you're looking at.
   *
   * Changing month left the selection behind, so the panel would read
   * "Saturday, August 22 — Nothing scheduled" beside a grid showing
   * September. It now follows: today if today is in view, otherwise the 1st.
   */
  useEffect(() => {
    if (view !== "month") return;
    setSelected((cur) => {
      if (cur && cur.getFullYear() === year && cur.getMonth() === month) return cur;
      const today = new Date();
      return today.getFullYear() === year && today.getMonth() === month
        ? today
        : new Date(year, month, 1);
    });
    setSelectedItem(null);
  }, [year, month, view]);

  const clearFilters = () => {
    setFilterUserId(""); setFilterProjectId(""); setFilterClientId(""); setFilterPriority("");
    setFilterTypeId(""); setFilterStatus(""); setExtraOnly(false); setAdHocOnly(false);
    setSearch("");
  };

  /**
   * Picking a project fills in the client it belongs to.
   *
   * The two filters are ANDed on the server, so choosing a project while a
   * different client was selected returned an empty month and no explanation.
   * A project has exactly one client, so there is nothing to ask about.
   */
  const chooseProject = (id: string) => {
    setFilterProjectId(id);
    const owner = projects.find((p) => p.id === id)?.clientId;
    if (owner) setFilterClientId(owner);
  };

  /** Choosing a client drops a project belonging to somebody else. */
  const chooseClient = (id: string) => {
    setFilterClientId(id);
    if (id && filterProjectId) {
      const current = projects.find((p) => p.id === filterProjectId);
      if (current?.clientId && current.clientId !== id) setFilterProjectId("");
    }
  };

  /** Projects narrow to the chosen client — the rest can't match anyway. */
  const visibleProjects = filterClientId
    ? projects.filter((p) => !p.clientId || p.clientId === filterClientId)
    : projects;

  // Scroll inside the grid to move between months/weeks (Google-style)
  const gridWrapRef = useRef<HTMLDivElement>(null);
  useWheelPeriod(gridWrapRef, {
    onPrev: () => (view === "month" ? prevMonth() : prevWeek()),
    onNext: () => (view === "month" ? nextMonth() : nextWeek()),
  });

  // Palette slots are assigned by RANK among the ids actually on screen, so
  // two clients (or two creative types) can never share a colour while the
  // palette has room — and the mapping is stable for a given month.
  const colorMaps = useMemo(() => {
    const rank = (ids: string[]) => {
      const map = new Map<string, string>();
      [...new Set(ids)].sort().forEach((id, i) => map.set(id, CLIENT_COLORS[i % CLIENT_COLORS.length]));
      return map;
    };
    return {
      client: rank(items.map((i) => i.clientId)),
      type: rank(items.map((i) => i.creativeType.id)),
    };
  }, [items]);

  const chipClass = (i: MasterItem): string => {
    if (colorBy === "client") return colorMaps.client.get(i.clientId) ?? CLIENT_COLORS[0];
    if (colorBy === "type") return colorMaps.type.get(i.creativeType.id) ?? CLIENT_COLORS[0];
    return contentStatusChip(i).chip;
  };

  /* Legend entries follow whatever the chips are coloured by. */
  const legend = useMemo(() => {
    if (colorBy === "client") {
      const seen = new Map<string, string>();
      items.forEach((i) => seen.set(i.client.name, colorMaps.client.get(i.clientId) ?? CLIENT_COLORS[0]));
      return [...seen.entries()].map(([label, cls]) => ({ label, cls }));
    }
    if (colorBy === "type") {
      const seen = new Map<string, string>();
      items.forEach((i) => seen.set(
        `${i.creativeType.name}`,
        colorMaps.type.get(i.creativeType.id) ?? CLIENT_COLORS[0],
      ));
      return [...seen.entries()].map(([label, cls]) => ({ label, cls }));
    }
    return (["PLANNED", "IN_REVIEW", "CLIENT_APPROVED", "POSTED", "MISSED"] as ContentStatus[])
      .map((s) => ({ label: CONTENT_STATUS_META[s].label, cls: CONTENT_STATUS_META[s].chip }));
  }, [colorBy, items, colorMaps]);

  /**
   * Text search across the month already loaded.
   *
   * Client-side on purpose: the month is in memory, so typing narrows the
   * grid as you type instead of waiting on a round trip per keystroke. It
   * searches the things you'd actually search by — what the piece is, who
   * it's for, and which project it belongs to.
   */
  const searchedItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.topic.toLowerCase().includes(q)
      || i.client.name.toLowerCase().includes(q)
      || (i.project?.name ?? "").toLowerCase().includes(q)
      || i.creativeType.name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const itemsOn = useCallback(
    (day: Date) => searchedItems.filter((i) => isSameDay(new Date(i.date), day)),
    [searchedItems],
  );
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

  const activeClientName = filterClientId ? clients.find((c) => c.id === filterClientId)?.name : null;


  /**
   * Filters as a rail, not a ribbon.
   *
   * They used to wrap across the top of the page: eight controls with no
   * labels on one line, each one costing the grid vertical space, and no way
   * to tell "All Types" from "All Statuses" without opening both. Grouped and
   * labelled down the side, they stay put while you read the month.
   */
  const filtersPanel = (
    <div className="p-4 space-y-5">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Search
        </label>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Topic, client, project…"
            className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Narrow to</p>

        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Client</label>
          <Select value={filterClientId} onChange={chooseClient} size="sm" className="w-full"
            options={[{ value: "", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: `${c.name}` }))]} />
        </div>

        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Project</label>
          <Select value={filterProjectId} onChange={chooseProject} size="sm" className="w-full"
            options={[{ value: "", label: "All projects" }, ...visibleProjects.map((p) => ({ value: p.id, label: `${p.name}` }))]} />
          {filterClientId && visibleProjects.length < projects.length && (
            <p className="text-[10px] text-gray-400 mt-1">
              Showing this client&rsquo;s projects only.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Content type</label>
          <Select value={filterTypeId} onChange={(v) => setFilterTypeId(v)} size="sm" className="w-full"
            options={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: t.id, label: String(`${t.icon ? `${t.icon} ` : ""}${t.name}`) }))]} />
        </div>

        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Status</label>
          <Select value={filterStatus} onChange={(v) => setFilterStatus(v)} size="sm" className="w-full"
            options={[{ value: "", label: "All statuses" }, ...Object.entries(CONTENT_STATUS_META).map(([k, v]) => ({ value: k, label: String(v.label) }))]} />
        </div>

        {canFilterByUser && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Assigned to</label>
            <Select value={filterUserId} onChange={(v) => setFilterUserId(v)} size="sm" className="w-full"
              options={[{ value: "", label: "Anyone" }, ...users.map((u) => ({ value: u.id, label: `${u.name}` }))]} />
          </div>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-3">Show on calendar</p>
        <Toggle checked={showTasks} onChange={setShowTasks} icon={<CheckSquare className="w-3 h-3" />} label="Tasks" />
        <Toggle checked={showProjects} onChange={setShowProjects} icon={<FolderKanban className="w-3 h-3" />} label="Projects" />
        {showTasks && (
          <div className="pl-6 pt-1">
            <Select value={filterPriority} onChange={(v) => setFilterPriority(v)} size="sm" className="w-full"
              options={[{ value: "", label: "Any priority" }, { value: "URGENT", label: "Urgent" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
          </div>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-3">Only show</p>
        <Toggle checked={extraOnly} onChange={setExtraOnly} label="Over-delivered extras" />
        <Toggle checked={adHocOnly} onChange={setAdHocOnly} icon={<Zap className="w-3 h-3 text-amber-500" />} label="Ad-hoc" />
      </div>

      {activeFilterCount > 0 && (
        <button onClick={clearFilters}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-colors">
          <X className="w-3 h-3" /> Clear {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );

  return (
    // Viewport-locked so a whole month fits without scrolling the page.
    <div className="flex flex-col h-screen-below-appbar min-h-0">
      {/* ── Toolbar (single row, Google-style) ──────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={goToday}
            className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-full hover:bg-gray-50 text-gray-700">
            Today
          </button>
          <div className="flex items-center">
            <button onClick={view === "month" ? prevMonth : prevWeek}
              title="Previous (or scroll up)"
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={view === "month" ? nextMonth : nextWeek}
              title="Next (or scroll down)"
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {view === "month"
                ? `${MONTH_NAMES[month]} ${year}`
                : `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </h1>
            <p className="text-[11px] text-gray-400 truncate">
              {items.length} item{items.length !== 1 ? "s" : ""}
              {activeClientName ? ` · ${activeClientName}` : " · all clients"}
              {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}`}
              {!can(currentUser, "clients.manage") && " · your linked work"}
            </p>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Color by — recolours every content chip on the grid */}
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-400">Color by</span>
              <div className="flex border border-gray-200 rounded-full overflow-hidden text-xs">
                {(["status", "client", "type"] as ColorBy[]).map((c) => (
                  <button key={c} onClick={() => setColorBy(c)}
                    title={`Colour chips by ${c}`}
                    className={`px-2.5 py-1.5 font-medium capitalize transition-colors ${colorBy === c ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-full overflow-hidden text-xs">
              <button onClick={() => setView("month")}
                className={`px-3 py-1.5 font-medium transition-colors ${view === "month" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Month
              </button>
              <button onClick={() => { setView("week"); setWeekStart(now); }}
                className={`px-3 py-1.5 font-medium transition-colors ${view === "week" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                Week
              </button>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-full transition-colors ${
                activeFilterCount > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddEventOpen(true)}>
              Add Event
            </Button>
          </div>
        </div>

      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Filter rail — beside the grid on desktop so opening it doesn't
            shorten the month, stacked above it on narrower screens. */}
        {showFilters && (
          <>
            <aside className="hidden lg:block w-60 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
              {filtersPanel}
            </aside>
            <div className="lg:hidden border-b border-gray-200 bg-white max-h-[45vh] overflow-y-auto">
              {filtersPanel}
            </div>
          </>
        )}

        <div ref={gridWrapRef} className="flex-1 min-w-0 min-h-0 flex flex-col px-3 sm:px-5 py-3">
          {/* The grid is the page's one object — give it an edge and a
              shadow so it sits ON the page rather than being a region of it. */}
          <div className="flex-1 min-h-0 border border-gray-200 dark:border-white/[0.07] rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_-16px_rgba(15,23,42,0.18)] dark:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)]">
          <MonthGrid
            fill
            view={view}
            year={year}
            month={month}
            weekStart={weekStart}
            selected={selected}
            loading={loading}
            onDayClick={(day) => {
              setSelectedItem(null);
              setSelected(selected && isSameDay(day, selected) ? null : day);
            }}
            cellCount={(day) => itemsOn(day).length + (showTasks || showProjects ? legacyOn(day).length : 0)}
            renderStrip={(day) => {
              const evs = eventsOn(day);
              if (evs.length === 0) return null;
              return (
                <div className="-mx-1.5 sm:-mx-2 mb-1">
                  {evs.slice(0, 2).map((e) => (
                    <div key={e.id}
                      title={e.title + (e.client ? ` (${e.client.name})` : "")}
                      className={`px-1.5 py-0.5 text-[9px] font-semibold truncate border-y ${EVENT_KIND_STYLE[e.kind]}`}>
                      {e.kind === "FESTIVAL" && <PartyPopper className="w-3 h-3 inline mr-1" />}
                      {e.isAdHoc && <Zap className="w-3 h-3 inline mr-1" />}
                      {e.title}
                    </div>
                  ))}
                </div>
              );
            }}
            /* Phones: a dot per item, coloured by creative type, with the
               detail in the agenda below. Three dots is the useful limit —
               past that it's a smudge, so the rest becomes a count. */
            renderCellMobile={(day) => {
              const dayItems = itemsOn(day);
              const evs = eventsOn(day);
              const legacy = (showTasks || showProjects) ? legacyOn(day) : [];
              const total = dayItems.length + evs.length + legacy.length;
              if (total === 0) return null;
              return (
                <div className="flex items-center justify-center gap-[3px] pt-[3px]">
                  {dayItems.slice(0, 3).map((i) => (
                    <span
                      key={i.id}
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ backgroundColor: i.creativeType.color ?? "#6366f1" }}
                    />
                  ))}
                  {dayItems.length === 0 && (evs.length > 0 || legacy.length > 0) && (
                    <span className="w-[5px] h-[5px] rounded-full bg-gray-400 dark:bg-slate-500" />
                  )}
                  {total > 3 && (
                    <span className="text-[8px] leading-none text-gray-400 dark:text-slate-500 font-semibold">
                      +{total - 3}
                    </span>
                  )}
                </div>
              );
            }}
            renderCell={(day) => {
              const dayItems = itemsOn(day);
              const legacy = (showTasks || showProjects) ? legacyOn(day) : [];
              const taskEvents = showTasks ? legacy.filter((e) => e.type === "task") : [];
              const projectEvents = showProjects ? legacy.filter((e) => e.type === "project") : [];
              // Chips lost the avatar and the two dots, so a third fits in
              // the same cell height.
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
                    const meta = contentStatusChip(i);
                    return (
                      <button key={i.id} type="button"
                        onClick={(e) => { e.stopPropagation(); setSelected(day); setSelectedItem(i); }}
                        title={`${i.client.name}${i.project ? ` · ${i.project.name}` : ""} — ${i.creativeType.name}: ${i.topic} (${meta.label})`}
                        /* A month cell is about 90px wide. The chip used to
                           spend that on a client bubble, a type dot, a status
                           dot and a bolt, leaving roughly 30px for the topic —
                           so every item on the grid read "Ree…". The colour
                           already carries whatever "Color by" is set to, and
                           the rest is in the tooltip and the day panel, so the
                           text gets the width instead. */
                        className={`w-full text-left flex items-center mb-[3px] pl-1.5 pr-1 py-[3px] rounded-[5px] border border-l-[3px] shadow-[0_1px_1px_rgba(15,23,42,0.04)] hover:shadow-[0_2px_5px_rgba(15,23,42,0.12)] hover:-translate-y-px transition-all duration-150 ${chipClass(i)}`}
                      >
                        <span className="text-[10.5px] font-medium truncate leading-[1.35] flex-1 min-w-0">
                          {i.topic}
                        </span>
                        {i.isAdHoc && <Zap className="w-2.5 h-2.5 ml-0.5 flex-shrink-0 opacity-70" />}
                      </button>
                    );
                  })}
                  {dayItems.length > maxShow && (
                    <span className="block text-[9px] font-medium text-gray-400 dark:text-slate-500 pl-1 pt-0.5">
                      +{dayItems.length - maxShow} more
                    </span>
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

          </div>

          {/* Legend — one compact line so the grid keeps the height */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500 overflow-x-auto flex-shrink-0">
            <span className="font-medium text-gray-600 capitalize flex-shrink-0">{colorBy}:</span>
            {legend.length === 0 ? (
              <span className="text-gray-400 flex-shrink-0">nothing planned this month</span>
            ) : legend.slice(0, 8).map((l) => (
              <span key={l.label} className={`px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0 ${l.cls}`}>
                {l.label}
              </span>
            ))}
            <span className="text-gray-300 flex-shrink-0">|</span>
            <span className="flex items-center gap-1 flex-shrink-0"><PartyPopper className="w-3 h-3 text-amber-500" /> event</span>
            <span className="flex items-center gap-1 flex-shrink-0"><Zap className="w-3 h-3 text-amber-500" /> ad-hoc</span>
            <span className="flex-shrink-0 text-gray-400">· dot = status · click a day for details</span>
          </div>
        </div>

        {/* ── Side panel — one content item, or the whole day ── */}
        {selected && (
          <div className="lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white overflow-y-auto max-h-[52vh] lg:max-h-none rounded-t-2xl lg:rounded-none shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] lg:shadow-none">
            {/* Grab handle — phones only. It reads as a sheet you can flick
                through rather than as the page simply continuing. */}
            <div className="lg:hidden sticky top-0 z-10 bg-white pt-2 pb-1 flex justify-center">
              <span className="w-9 h-1 rounded-full bg-gray-200" />
            </div>
            {selectedItem ? (
              /* v3 Phase 0 (defect 4): a chip opens its own item here */
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
                  <button onClick={() => setSelectedItem(null)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {selected.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </button>
                  <button onClick={() => { setSelectedItem(null); setSelected(null); }}
                    className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className={`border rounded-xl p-3 mb-4 ${contentStatusChip(selectedItem).chip} ${selectedItem.isAdHoc ? "border-dashed" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1.5">
                    <span className="text-xs">
                      <CreativeTypeDot color={selectedItem.creativeType.color} /> {selectedItem.creativeType.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase">
                      {CONTENT_STATUS_META[selectedItem.status].label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold leading-snug">{selectedItem.topic}</p>
                </div>

                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-gray-400 mb-0.5">Client</dt>
                    <dd className="text-gray-900 font-medium">{selectedItem.client.name}</dd>
                  </div>
                  {selectedItem.project && (
                    <div>
                      <dt className="text-gray-400 mb-0.5">Project</dt>
                      <dd className="text-gray-900 font-medium">{selectedItem.project.name}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-400 mb-0.5">Publish date</dt>
                    <dd className="text-gray-900 font-medium">
                      {new Date(selectedItem.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 mb-0.5">Assigned to</dt>
                    <dd className="text-gray-900 font-medium">
                      {selectedItem.tasks.flatMap((t) => t.assignees.map((a) => a.user.name)).join(", ") || "Nobody yet"}
                    </dd>
                  </div>
                  {(selectedItem.isExtra || selectedItem.isAdHoc) && (
                    <div>
                      <dt className="text-gray-400 mb-0.5">Flags</dt>
                      <dd className="flex flex-wrap gap-1">
                        {selectedItem.isExtra && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">Extra</span>
                        )}
                        {selectedItem.isAdHoc && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium inline-flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> Ad-hoc
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                <Link href={`/clients/${selectedItem.clientId}?tab=content`}
                  className="mt-5 flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors">
                  Open in {selectedItem.client.name}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                {isSameDay(selected, new Date()) ? (
                  <span className="text-xs font-medium text-indigo-600">Today</span>
                ) : (
                  // Getting back to today took scrolling the month and finding
                  // the cell. One tap instead.
                  <button
                    onClick={() => {
                      const now = new Date();
                      setYear(now.getFullYear());
                      setMonth(now.getMonth());
                      setSelectedItem(null);
                      setSelected(now);
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Today
                  </button>
                )}
              </div>

              {/* Events */}
              {selectedEvents.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Events</p>
                  {selectedEvents.map((e) => (
                    <div key={e.id} className={`border rounded-xl p-3 mb-2 ${EVENT_KIND_STYLE[e.kind]} ${e.isAdHoc ? "border-dashed" : ""}`}>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {e.kind === "FESTIVAL" && <PartyPopper className="w-3 h-3" />} {e.isAdHoc && <Zap className="w-3 h-3" />} {e.title}
                      </p>
                      {e.client && <p className="text-xs opacity-70 mt-0.5">{e.client.name}</p>}
                      {e.notes && <p className="text-xs opacity-70 mt-1">{e.notes}</p>}
                      {e.kind === "SHOOT" && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => setShootTaskFor(e)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-white/70 rounded-lg hover:bg-white">
                            Create task
                          </button>
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
                        const meta = contentStatusChip(i);
                        return (
                          <button key={i.id} type="button" onClick={() => setSelectedItem(i)}
                            className="block w-full text-left mb-2">
                            <div className={`border rounded-xl p-3 hover:shadow-sm transition-all ${meta.chip} ${i.isAdHoc ? "border-dashed" : ""}`}>
                              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                                <span className="text-xs inline-flex items-center gap-1.5"><CreativeTypeDot color={i.creativeType.color} />{i.creativeType.name}</span>
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
                          </button>
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
            )}
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
    title: "", kind: "CAMPAIGN", date: todayKey(),
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
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Event</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
              <input autoFocus value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Diwali campaign kickoff"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Kind</label>
              <Select
                value={form.kind}
                onChange={(v) => setForm((f) => ({ ...f, kind: v }))}
                options={[...["FESTIVAL", "CAMPAIGN", "SHOOT", "INTERNAL", "OTHER"].map((k) => ({ value: k, label: String(k.charAt(0) + k.slice(1).toLowerCase()) }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Client (optional)</label>
              <Select
                value={form.clientId}
                onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
                options={[{ value: "", label: "Org-wide" }, ...clients.map((c) => ({ value: c.id, label: `${c.name}` }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={form.date} min={todayKey()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">End date (optional)</label>
              <input type="date" value={form.endDate} min={form.date || todayKey()}
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
