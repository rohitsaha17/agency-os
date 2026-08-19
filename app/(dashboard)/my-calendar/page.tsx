"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, CheckCircle2, Circle,
  AlertCircle, ChevronDown, Check, CalendarDays, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import { CalendarTasksSwitch } from "@/components/calendar/CalendarTasksSwitch";
import {
  MonthGrid, MONTH_NAMES, isSameDay, getWeekDays, isToday, getDaysInGrid,
} from "@/components/calendar/MonthGrid";
import { useWheelPeriod } from "@/components/calendar/useWheelPeriod";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import { toast } from "@/lib/toast";

type View = "day" | "week" | "month" | "year" | "schedule";

const VIEW_OPTIONS: { id: View; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "D" },
  { id: "week", label: "Week", key: "W" },
  { id: "month", label: "Month", key: "M" },
  { id: "year", label: "Year", key: "Y" },
  { id: "schedule", label: "Schedule", key: "A" },
];

type Kind = "task" | "content" | "personal" | "event" | "booking";

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
  booking:  { label: "Shoots",    chip: "bg-sky-50 border-sky-200 text-sky-800",             dot: "bg-sky-500" },
};

const HOUR_H = 48; // px per hour in the time grid
const ALL_KINDS: Kind[] = ["task", "content", "personal", "event", "booking"];

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; }
function keyOf(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function fmtHour(h: number) {
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${suffix}`;
}
/** Minutes from midnight for a timed entry, or null when it's all-day. */
function minutesOf(e: Entry): number | null {
  if (e.kind === "booking") { const d = new Date(e.date); return d.getHours() * 60 + d.getMinutes(); }
  if (e.kind === "personal" && e.time) {
    const [h, m] = e.time.split(":").map(Number);
    if (Number.isFinite(h)) return h * 60 + (m || 0);
  }
  return null;
}

export default function MyCalendarPage() {
  const now = useMemo(() => new Date(), []);
  const { user: currentUser } = useCurrentUser();
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
  const gridRef = useRef<HTMLDivElement>(null);

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

  /* ── Auto-scroll the time grid to ~7am on mount/view change ── */
  useEffect(() => {
    if ((view === "day" || view === "week") && gridRef.current) {
      gridRef.current.scrollTop = 7 * HOUR_H;
    }
  }, [view]);

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
        {e.kind === "content" && <span className="text-[10px] flex-shrink-0">{e.creativeType?.icon ?? "✨"}</span>}
        {e.kind === "event" && <span className="text-[10px] flex-shrink-0">🎉</span>}
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

  /* Time grid used by Day + Week */
  const TimeGrid = ({ days }: { days: Date[] }) => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return (
      <div className="flex flex-col h-full min-h-0 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Day headers + all-day row */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <div className="w-16 flex-shrink-0 border-r border-gray-100 flex items-end justify-end pr-2 pb-1">
            <span className="text-[10px] text-gray-400">GMT{-new Date().getTimezoneOffset() / 60 >= 0 ? "+" : ""}{-new Date().getTimezoneOffset() / 60}</span>
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
            {days.map((d, i) => {
              const allDay = entriesOn(d).filter((e) => minutesOf(e) === null);
              return (
                <div key={i} className={`border-l border-gray-100 px-1 pt-2 pb-1 ${isToday(d) ? "bg-indigo-50/40" : ""}`}>
                  <div className="text-center mb-1">
                    <p className="text-[10px] font-medium text-gray-400 uppercase">{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
                    <button onClick={() => { setAnchor(d); setView("day"); }}
                      className={`inline-flex w-8 h-8 items-center justify-center text-base font-semibold rounded-full transition-colors ${
                        isToday(d) ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
                      }`}>
                      {d.getDate()}
                    </button>
                  </div>
                  <div className="min-h-[22px] max-h-24 overflow-y-auto">
                    {allDay.map((e) => chip(e, { compact: true }))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hour rows */}
        <div ref={gridRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="flex relative" style={{ height: 24 * HOUR_H }}>
            {/* Hour labels */}
            <div className="w-16 flex-shrink-0 border-r border-gray-100">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} style={{ height: HOUR_H }} className="relative">
                  <span className="absolute -top-1.5 right-2 text-[10px] text-gray-400">{h === 0 ? "" : fmtHour(h)}</span>
                </div>
              ))}
            </div>
            {/* Day columns */}
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
              {days.map((d, i) => {
                const timed = entriesOn(d).filter((e) => minutesOf(e) !== null);
                return (
                  <div key={i} className={`relative border-l border-gray-100 ${isToday(d) ? "bg-indigo-50/20" : ""}`}
                    onClick={() => { setAddDate(d.toISOString().slice(0, 10)); setAddOpen(true); }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} style={{ height: HOUR_H }} className="border-b border-gray-50" />
                    ))}
                    {/* Current-time line */}
                    {isToday(d) && (
                      <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_H }}>
                        <div className="h-[2px] bg-red-500" />
                        <div className="w-2 h-2 rounded-full bg-red-500 -mt-[5px] -ml-1" />
                      </div>
                    )}
                    {/* Timed entries */}
                    {timed.map((e) => {
                      const startMin = minutesOf(e)!;
                      const endMin = e.endDate
                        ? (() => { const d2 = new Date(e.endDate); return d2.getHours() * 60 + d2.getMinutes(); })()
                        : startMin + 45;
                      const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_H - 2);
                      const meta = KIND_META[e.kind];
                      return (
                        <a key={`${e.kind}-${e.id}`} href={e.link ?? "#"}
                          onClick={(ev) => ev.stopPropagation()}
                          title={e.title}
                          className={`absolute left-1 right-1 rounded-md border px-1.5 py-0.5 overflow-hidden ${meta.chip}`}
                          style={{ top: (startMin / 60) * HOUR_H + 1, height }}>
                          <p className="text-[10px] font-semibold truncate">{e.title}</p>
                          {height > 30 && <p className="text-[9px] opacity-70">{e.time ?? new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>}
                        </a>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarDays className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">Nothing scheduled in the next 30 days.</p>
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
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
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
            <div className="flex items-center justify-between mb-2">
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
            <TimeGrid days={[anchor]} />
          ) : view === "week" ? (
            <TimeGrid days={weekDays} />
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
  const [form, setForm] = useState({
    title: "", date: defaultDate ?? new Date().toISOString().slice(0, 10), time: "", note: "", userId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSenior) fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTeammates(d); });
  }, [isSenior]);

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (mode === "teammate" && !form.userId) { setError("Pick a teammate"); return; }
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
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
            <select value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Pick a teammate…</option>
              {teammates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <input autoFocus value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. Send Acme captions"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />

          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.date}
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
