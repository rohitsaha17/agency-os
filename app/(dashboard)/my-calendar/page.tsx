"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, CheckCircle2, Circle,
  AlertCircle, ChevronDown, Check, CalendarDays, Users, Zap, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import { CalendarTasksSwitch } from "@/components/calendar/CalendarTasksSwitch";
import {
  MonthGrid, MONTH_NAMES, isSameDay, getWeekDays, isToday, getDaysInGrid,
} from "@/components/calendar/MonthGrid";
import { useWheelPeriod } from "@/components/calendar/useWheelPeriod";
import Link from "next/link";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import { toast } from "@/lib/toast";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { Select } from "@/components/ui/Select";
import { todayKey } from "@/lib/date-key";

type View = "day" | "week" | "month" | "year" | "schedule";

const VIEW_OPTIONS: { id: View; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "D" },
  { id: "week", label: "Week", key: "W" },
  { id: "month", label: "Month", key: "M" },
  { id: "year", label: "Year", key: "Y" },
  { id: "schedule", label: "Schedule", key: "A" },
];

type Kind = "task" | "content" | "personal" | "event";

interface Entry {
  kind: Kind;
  id: string;
  date: string;
  endDate?: string | null;
  time?: string | null;
  title: string;
  topic?: string | null;
  status?: string;
  priority?: string;
  done?: boolean;
  note?: string | null;
  clientName?: string | null;
  creativeType?: { name: string; icon: string | null; color: string | null };
  addedBy?: string | null;
  eventKind?: string;
  link?: string;
}

interface OverdueEntry {
  kind: "task" | "personal";
  id: string;
  title: string;
  date: string;
  priority?: string;
  link?: string;
}

const KIND_META: Record<Kind, { label: string; chip: string; dot: string }> = {
  task:     { label: "Tasks",     chip: "bg-indigo-50 border-indigo-200 text-indigo-800",   dot: "bg-indigo-500" },
  content:  { label: "Content",   chip: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800", dot: "bg-fuchsia-500" },
  personal: { label: "Reminders", chip: "bg-emerald-50 border-emerald-200 text-emerald-800", dot: "bg-emerald-500" },
  event:    { label: "Events",    chip: "bg-amber-50 border-amber-200 text-amber-800",       dot: "bg-amber-500" },
};

/**
 * A calendar day as YYYY-MM-DD in LOCAL time.
 *
 * Not toISOString().slice(0,10) — that converts to UTC first, so clicking
 * "22 Aug" anywhere east of Greenwich after early evening pre-fills the 21st.
 */
/**
 * What time of day this entry is due, in minutes, or null for "sometime that
 * day". A personal reminder carries an explicit time; a task carries the time
 * on its deadline.
 */
function minutesOf(e: Entry): number | null {
  if (e.kind === "personal" && e.time) {
    const [h, m] = e.time.split(":").map(Number);
    if (Number.isFinite(h)) return h * 60 + (m || 0);
  }
  if (e.kind !== "personal" && e.date) {
    const d = new Date(e.date);
    // Exactly midnight UTC is a date-only value, not a dawn deadline.
    if (!(d.getUTCHours() === 0 && d.getUTCMinutes() === 0)) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  return null;
}

function toDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const ALL_KINDS: Kind[] = ["task", "content", "personal", "event"];

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; }
function keyOf(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
export default function MyCalendarPage() {
  const now = useMemo(() => new Date(), []);
  const { user: currentUser } = useCurrentUser();
  // Same capability the sidebar gates /calendar on, so the link never points
  // somewhere the person can't go.
  const canSeeTeamCalendar = can(currentUser, "content.plan");
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [overdue, setOverdue] = useState<OverdueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<{ id: string; title: string } | null>(null);
  const [viewMenu, setViewMenu] = useState(false);
  const [visibleKinds, setVisibleKinds] = useState<Set<Kind>>(new Set(ALL_KINDS));
  const [miniMonth, setMiniMonth] = useState<Date>(new Date());

  const isSenior =
    currentUser?.role === "ADMIN" || currentUser?.role === "OWNER" ||
    currentUser?.role === "MANAGER" || currentUser?.designation === "HEAD_OF_DESIGN";

  /* ── Visible range per view ── */
  const range = useMemo(() => {
    if (view === "year") {
      return {
        from: new Date(anchor.getFullYear(), 0, 1).toISOString(),
        to: new Date(anchor.getFullYear() + 1, 0, 1).toISOString(),
      };
    }
    if (view === "month") {
      return {
        from: new Date(anchor.getFullYear(), anchor.getMonth(), -7).toISOString(),
        to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 8).toISOString(),
      };
    }
    if (view === "schedule") {
      const from = startOfDay(anchor);
      return { from: from.toISOString(), to: new Date(from.getTime() + 30 * 86400000).toISOString() };
    }
    if (view === "week") {
      const days = getWeekDays(anchor);
      return {
        from: startOfDay(days[0]).toISOString(),
        to: new Date(startOfDay(days[6]).getTime() + 86400000).toISOString(),
      };
    }
    const from = startOfDay(anchor);
    return { from: from.toISOString(), to: new Date(from.getTime() + 86400000).toISOString() };
  }, [view, anchor]);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/my-calendar?from=${range.from}&to=${range.to}`);
      const d = await res.json();
      if (res.ok) { setEntries(d.entries ?? []); setOverdue(d.overdue ?? []); }
    } finally { setLoading(false); }
  }, [range.from, range.to]);

  useEffect(() => { setLoading(true); fetchEntries(); }, [fetchEntries]);
  // Live: reflect task-board edits (and teammates' changes) without a reload
  useLiveRefresh(["calendar", "tasks"], fetchEntries);

  /* ── Keyboard shortcuts (D W M Y A / T for today) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      const k = e.key.toLowerCase();
      const map: Record<string, View> = { d: "day", w: "week", m: "month", y: "year", a: "schedule" };
      if (map[k]) { setView(map[k]); setViewMenu(false); }
      if (k === "t") { setAnchor(new Date()); setMiniMonth(new Date()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => entries.filter((e) => visibleKinds.has(e.kind)), [entries, visibleKinds]);
  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of shown) {
      const k = keyOf(new Date(e.date));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [shown]);
  const entriesOn = useCallback((d: Date) => byDay.get(keyOf(d)) ?? [], [byDay]);

  /* ── Navigation ── */
  const goToday = () => { setAnchor(new Date()); setMiniMonth(new Date()); };
  const shift = (dir: 1 | -1) => {
    const n = new Date(anchor);
    if (view === "day") n.setDate(n.getDate() + dir);
    else if (view === "week") n.setDate(n.getDate() + dir * 7);
    else if (view === "month") n.setMonth(n.getMonth() + dir);
    else if (view === "year") n.setFullYear(n.getFullYear() + dir);
    else n.setDate(n.getDate() + dir * 30);
    setAnchor(n);
    setMiniMonth(n);
  };

  // Scroll on month/year views to move between periods (the day/week time
  // grids keep their own vertical scrolling).
  const mainRef = useRef<HTMLDivElement>(null);
  useWheelPeriod(mainRef, {
    onPrev: () => shift(-1),
    onNext: () => shift(1),
    enabled: view === "month" || view === "year",
  });

  const title = useMemo(() => {
    if (view === "year") return String(anchor.getFullYear());
    if (view === "month") return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === "day") return anchor.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
    if (view === "schedule") return `From ${anchor.toLocaleDateString("en-US", { day: "numeric", month: "short" })}`;
    const days = getWeekDays(anchor);
    const a = days[0], b = days[6];
    return a.getMonth() === b.getMonth()
      ? `${MONTH_NAMES[a.getMonth()]} ${a.getFullYear()}`
      : `${MONTH_NAMES[a.getMonth()].slice(0, 3)} – ${MONTH_NAMES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  }, [view, anchor]);

  /* ── Mutations ── */
  const togglePersonal = async (e: Entry) => {
    setEntries((prev) => prev.map((x) => (x.kind === "personal" && x.id === e.id ? { ...x, done: !e.done } : x)));
    await fetch(`/api/personal-items/${e.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !e.done }),
    });
    broadcastChange("all"); // the task board shows the same item
  };

  /* ── Renderers ── */
  const chip = (e: Entry, opts?: { compact?: boolean }) => {
    const meta = KIND_META[e.kind];
    const done = e.kind === "personal" ? e.done : e.status === "DONE";
    return (
      <div key={`${e.kind}-${e.id}`}
        className={`flex items-center gap-1.5 border rounded-md px-1.5 py-0.5 mb-0.5 ${meta.chip} ${done ? "opacity-50" : ""}`}>
        {(e.kind === "task" || e.kind === "personal") && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              if (e.kind === "personal") togglePersonal(e);
              else if (e.status !== "DONE") setDeliveryFor({ id: e.id, title: e.title });
            }}
            className="flex-shrink-0">
            {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3 opacity-60" />}
          </button>
        )}
        {e.kind === "content" && <CreativeTypeDot color={e.creativeType?.color} />}
        {e.kind === "event" && <PartyPopper className="w-2.5 h-2.5 flex-shrink-0 text-amber-500" />}
        {e.time && <span className="text-[9px] font-semibold flex-shrink-0">{e.time}</span>}
        {e.link ? (
          <a href={e.link} onClick={(ev) => ev.stopPropagation()}
            className={`text-[10px] truncate flex-1 hover:underline ${done ? "line-through" : ""}`}>{e.title}</a>
        ) : (
          <span className={`text-[10px] truncate flex-1 ${done ? "line-through" : ""}`}>{e.title}</span>
        )}
        {!opts?.compact && e.clientName && <span className="text-[9px] opacity-60 flex-shrink-0">{e.clientName}</span>}
      </div>
    );
  };

  /**
   * Day and Week, as lists rather than a timetable.
   *
   * These were an hourly grid — twenty-four rows per column, of which maybe two
   * ever held anything. A deadline of "Friday 6pm" doesn't occupy 6pm to 6:45pm
   * the way a meeting does; it's a moment to be ready by. Rendering it as a
   * block on a timetable spread five items across a page of empty cells and
   * made the week harder to read than the month.
   *
   * So: Week gives each day a column and lists what's due in it. Day is the
   * same thing with one column. Times still show, on the items that have one.
   * Month is untouched — a month grid is already a list per day.
   */
  const AgendaGrid = ({ days }: { days: Date[] }) => {
    // Timed items first, in clock order, then the ones with no particular hour.
    const ordered = (d: Date) =>
      [...entriesOn(d)].sort((a, b) => {
        const ma = minutesOf(a), mb = minutesOf(b);
        if (ma === null && mb === null) return 0;
        if (ma === null) return 1;
        if (mb === null) return -1;
        return ma - mb;
      });

    const single = days.length === 1;

    return (
      <div className="flex flex-col h-full min-h-0 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
          {days.map((d, i) => {
            const items = ordered(d);
            return (
              <div key={i} className={`flex flex-col min-h-0 ${i > 0 ? "border-l border-gray-100" : ""} ${isToday(d) ? "bg-indigo-50/30" : ""}`}>
                {/* Day header */}
                <div className="flex-shrink-0 px-2 pt-3 pb-2 border-b border-gray-100 text-center">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                    {d.toLocaleDateString("en-US", { weekday: single ? "long" : "short" })}
                  </p>
                  <button onClick={() => { setAnchor(d); setView("day"); }}
                    className={`inline-flex w-8 h-8 items-center justify-center text-base font-semibold rounded-full transition-colors mt-0.5 ${
                      isToday(d) ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}>
                    {d.getDate()}
                  </button>
                  {items.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </p>
                  )}
                </div>

                {/* That day's work */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {items.length === 0 ? (
                    <button
                      onClick={() => { setAddDate(toDateKey(d)); setAddOpen(true); }}
                      className="w-full h-full min-h-[80px] rounded-lg text-[11px] text-gray-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-colors"
                    >
                      {single ? "Nothing due today" : "—"}
                    </button>
                  ) : (
                    <>
                      {items.map((e) => {
                        const mins = minutesOf(e);
                        return (
                          <div key={`${e.kind}-${e.id}`} className={single ? "flex items-start gap-3" : ""}>
                            {single && (
                              <span className="w-16 flex-shrink-0 pt-0.5 text-[11px] tabular-nums text-gray-400 text-right">
                                {mins === null
                                  ? "All day"
                                  : new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">{chip(e, { compact: !single })}</div>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => { setAddDate(toDateKey(d)); setAddOpen(true); }}
                        className="w-full py-1.5 rounded-lg text-[11px] text-gray-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-colors"
                      >
                        + Add
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* Year view — 12 mini months */
  const YearView = () => (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 h-full overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 12 }, (_, m) => {
          const first = new Date(anchor.getFullYear(), m, 1);
          const days = getDaysInGrid(anchor.getFullYear(), m);
          return (
            <div key={m}>
              <button onClick={() => { setAnchor(first); setView("month"); }}
                className="text-sm font-semibold text-gray-800 mb-2 hover:text-indigo-600">
                {MONTH_NAMES[m]}
              </button>
              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i} className="text-[9px] text-gray-400 font-medium">{d}</span>
                ))}
                {days.map((d, i) => {
                  const inMonth = d.getMonth() === m;
                  const has = inMonth && entriesOn(d).length > 0;
                  return (
                    <button key={i} onClick={() => { setAnchor(d); setView("day"); }}
                      className={`relative w-6 h-6 mx-auto text-[10px] rounded-full flex items-center justify-center transition-colors ${
                        !inMonth ? "text-gray-300" :
                        isToday(d) ? "bg-indigo-600 text-white font-semibold" :
                        "text-gray-700 hover:bg-gray-100"
                      }`}>
                      {d.getDate()}
                      {has && !isToday(d) && (
                        <span className="absolute bottom-0 w-1 h-1 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* Schedule (agenda) view */
  const ScheduleView = () => {
    const groups = new Map<string, Entry[]>();
    for (const e of [...shown].sort((a, b) => a.date.localeCompare(b.date))) {
      const d = new Date(e.date);
      groups.set(keyOf(d), [...(groups.get(keyOf(d)) ?? []), e]);
    }
    const rows = [...groups.entries()];
    return (
      <div className="bg-white border border-gray-200 rounded-2xl h-full overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <CalendarDays className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">Nothing scheduled in the next 30 days.</p>
            {/* This page only ever shows YOUR work. Empty here doesn't mean
                empty everywhere, and saying nothing about that reads as the
                calendar being broken. */}
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs">
              This calendar shows only what is assigned to you.
            </p>
            {canSeeTeamCalendar && (
              <Link
                href="/calendar"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                See the team calendar
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ) : rows.map(([k, list]) => {
          const d = new Date(list[0].date);
          return (
            <div key={k} className="flex gap-4 px-5 py-3 border-b border-gray-50 last:border-0">
              <div className="w-16 flex-shrink-0 text-right">
                <p className={`text-lg font-semibold ${isToday(d) ? "text-indigo-600" : "text-gray-800"}`}>{d.getDate()}</p>
                <p className="text-[10px] text-gray-400 uppercase">{d.toLocaleDateString("en-US", { weekday: "short", month: "short" })}</p>
              </div>
              <div className="flex-1 min-w-0 space-y-1">{list.map((e) => chip(e))}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const weekDays = getWeekDays(anchor);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-dvh min-h-0">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={goToday}
            className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-full hover:bg-gray-50 text-gray-700">
            Today
          </button>
          <div className="flex items-center">
            <button onClick={() => shift(-1)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => shift(1)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mr-auto">{title}</h1>

          {/* View dropdown */}
          <div className="relative">
            <button onClick={() => setViewMenu((v) => !v)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium border border-gray-300 rounded-full hover:bg-gray-50 text-gray-700">
              {VIEW_OPTIONS.find((v) => v.id === view)?.label}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {viewMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setViewMenu(false)} />
                <div className="absolute right-0 top-10 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[190px]">
                  {VIEW_OPTIONS.map((v) => (
                    <button key={v.id} onClick={() => { setView(v.id); setViewMenu(false); }}
                      className="w-full flex flex-wrap items-center justify-between gap-y-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <span className="flex items-center gap-2">
                        {view === v.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        <span className={view === v.id ? "font-medium text-indigo-700" : ""}>{v.label}</span>
                      </span>
                      <span className="text-xs text-gray-400">{v.key}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100 my-1.5" />
                  {ALL_KINDS.map((k) => (
                    <button key={k}
                      onClick={() => setVisibleKinds((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; })}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      {visibleKinds.has(k)
                        ? <Check className="w-3.5 h-3.5 text-indigo-600" />
                        : <span className="w-3.5" />}
                      Show {KIND_META[k].label.toLowerCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <CalendarTasksSwitch active="calendar" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Left rail: create + mini month + legend ── */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white p-4 hidden lg:flex flex-col overflow-y-auto">
          <Button size="sm" icon={<Plus className="w-4 h-4" />}
            onClick={() => { setAddDate(null); setAddOpen(true); }}>
            Create
          </Button>

          {/* Mini month */}
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
              <p className="text-sm font-semibold text-gray-800">
                {MONTH_NAMES[miniMonth.getMonth()]} {miniMonth.getFullYear()}
              </p>
              <div className="flex">
                <button onClick={() => setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-500"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-500"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="text-[9px] text-gray-400 font-medium">{d}</span>
              ))}
              {getDaysInGrid(miniMonth.getFullYear(), miniMonth.getMonth()).map((d, i) => {
                const inMonth = d.getMonth() === miniMonth.getMonth();
                const selected = isSameDay(d, anchor);
                return (
                  <button key={i}
                    onClick={() => { setAnchor(d); if (view === "year" || view === "schedule") setView("day"); }}
                    className={`w-6 h-6 mx-auto text-[11px] rounded-full flex items-center justify-center transition-colors ${
                      !inMonth ? "text-gray-300" :
                      isToday(d) ? "bg-indigo-600 text-white font-semibold" :
                      selected ? "bg-indigo-100 text-indigo-700 font-medium" :
                      "text-gray-700 hover:bg-gray-100"
                    }`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend / filters */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Show on calendar</p>
            <div className="space-y-1">
              {ALL_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2.5 px-1 py-1 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
                  <input type="checkbox" checked={visibleKinds.has(k)}
                    onChange={() => setVisibleKinds((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; })}
                    className="rounded border-gray-300 text-indigo-600" />
                  <span className={`w-2.5 h-2.5 rounded-sm ${KIND_META[k].dot}`} />
                  <span className="flex-1">{KIND_META[k].label}</span>
                </label>
              ))}
            </div>
          </div>

          {overdue.length > 0 && (
            <div className="mt-6 border border-red-200 bg-red-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Overdue ({overdue.length})
              </p>
              <ul className="space-y-1">
                {overdue.slice(0, 5).map((o) => (
                  <li key={`${o.kind}-${o.id}`} className="text-[11px] text-red-800 truncate">
                    {o.link ? <a href={o.link} className="hover:underline">{o.title}</a> : o.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Main view ── */}
        <div ref={mainRef} className="flex-1 min-w-0 bg-gray-50 p-3 sm:p-4 overflow-hidden">
          {loading ? (
            <div className="h-full bg-white border border-gray-200 rounded-2xl p-4">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 21 }, (_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            </div>
          ) : view === "day" ? (
            <AgendaGrid days={[anchor]} />
          ) : view === "week" ? (
            <AgendaGrid days={weekDays} />
          ) : view === "month" ? (
            <div className="h-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <MonthGrid
                fill
                view="month"
                year={anchor.getFullYear()}
                month={anchor.getMonth()}
                selected={anchor}
                onDayClick={(day) => { setAnchor(day); setView("day"); }}
                cellCount={(day) => entriesOn(day).length}
                renderCell={(day) => {
                  const list = entriesOn(day);
                  return (
                    <>
                      {list.slice(0, 3).map((e) => chip(e, { compact: true }))}
                      {list.length > 3 && <span className="text-[9px] text-gray-400">+{list.length - 3} more</span>}
                    </>
                  );
                }}
              />
            </div>
          ) : view === "year" ? (
            <YearView />
          ) : (
            <ScheduleView />
          )}
        </div>
      </div>

      {addOpen && (
        <AddPersonalDialog
          isSenior={isSenior}
          defaultDate={addDate}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); fetchEntries(); broadcastChange("all"); }}
        />
      )}

      {deliveryFor && (
        <DeliveryDialog
          taskId={deliveryFor.id}
          taskTitle={deliveryFor.title}
          onClose={() => setDeliveryFor(null)}
          onCompleted={() => { setDeliveryFor(null); fetchEntries(); broadcastChange("all"); }}
        />
      )}
    </div>
  );
}

// ── Add reminder dialog ──────────────────────────────────────

function AddPersonalDialog({
  isSenior, defaultDate, onClose, onSaved,
}: {
  isSenior: boolean;
  defaultDate?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"self" | "teammate">("self");
  const [teammates, setTeammates] = useState<{ id: string; name: string }[]>([]);
  const today = todayKey();
  const [form, setForm] = useState({
    title: "",
    // Clicking a past day still opens the dialog — you may well have meant the
    // day beside it — but it opens on today rather than offering to remind you
    // about something that has already happened.
    date: defaultDate && defaultDate >= today ? defaultDate : today,
    time: "", note: "", userId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSenior) fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTeammates(d); });
  }, [isSenior]);

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (mode === "teammate" && !form.userId) { setError("Pick a teammate"); return; }
    // The date input's `min` is a hint the picker respects and typing doesn't.
    if (form.date < today) { setError("Pick today or a day after — a reminder for a past day can't be acted on."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/personal-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, date: form.date, time: form.time || null, note: form.note || null,
          ...(mode === "teammate" && { userId: form.userId }),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Save failed");
      toast.success("Added to your calendar");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add reminder</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

          {isSenior && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button onClick={() => setMode("self")}
                className={`flex-1 px-3 py-1.5 font-medium ${mode === "self" ? "bg-indigo-50 text-indigo-700" : "text-gray-500"}`}>
                For me
              </button>
              <button onClick={() => setMode("teammate")}
                className={`flex-1 px-3 py-1.5 font-medium ${mode === "teammate" ? "bg-indigo-50 text-indigo-700" : "text-gray-500"}`}>
                Add for teammate
              </button>
            </div>
          )}

          {mode === "teammate" && (
            <Select
              value={form.userId}
              onChange={(v) => setForm((f) => ({ ...f, userId: v }))}
              options={[{ value: "", label: "Pick a teammate…" }, ...teammates.map((t) => ({ value: t.id, label: String(t.name) }))]}
            />
          )}

          <input autoFocus value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. Send Acme captions"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="date" value={form.date} min={today}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input type="time" value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <textarea value={form.note} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Note (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Add</Button>
        </div>
      </div>
    </div>
  );
}
