"use client";

/**
 * Team availability — a resource planner, not a leave register.
 *
 * The old page was two stacked lists: your blocked days, then everybody's.
 * That is the right data arranged around the wrong question. Nobody opens this
 * page to read a list of absences; they open it because they are about to
 * promise a client a date and need to know who can take the work. Answering
 * that from two lists meant holding one of the two axes — people, or days — in
 * your head while you scanned the other.
 *
 * So: a grid. People down the side, days across the top, one cell per person
 * per day saying whether they can work and how much they already have on.
 * Every other surface here is a way into that same fact — the crew finder asks
 * it about one day, the drawer asks it about one person, the phone's day view
 * asks it about today.
 *
 * WHAT DID NOT CHANGE, deliberately:
 *   · who may block whose days (shoot crew their own, admins anyone)
 *   · that approved leave writes its own days and only a revoke removes them
 *   · that the assignment guard, not this screen, is the enforcement
 *   · that workload is a signal and never a cap
 *
 * The grid is a convenience. If it ever disagrees with the server, the server
 * is right — which is why Assign goes through POST /api/tasks and shows the
 * 409 rather than deciding for itself who is assignable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Users, Search, CalendarDays, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LoadError } from "@/components/ui/LoadError";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import {
  dayStatus, loadLevel, type DayCell, type UnavailabilityKind,
} from "@/lib/availability";
import { Kpi, Legend } from "@/components/availability/chrome";
import {
  AvailabilityGrid, type GridDay, type GridGroup,
} from "@/components/availability/AvailabilityGrid";
import { DayBoard, type DayRow } from "@/components/availability/DayBoard";
import { PersonDayDrawer } from "@/components/availability/PersonDayDrawer";
import { BlockDaysDialog } from "@/components/availability/BlockDaysDialog";
import { FindCrewDialog } from "@/components/availability/FindCrewDialog";

/* ---------------------------------------------------------------- *
 * Dates, in the viewer's own calendar.
 *
 * Every key here is built from LOCAL components. Going via UTC shifts an
 * Indian team by a day either side of midnight, which on this screen means
 * telling somebody a photographer is free on a day he is shooting.
 * ---------------------------------------------------------------- */

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(k: string, n: number): string {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
/** Monday of the week containing `k`. Agencies shoot at weekends; the week
 *  still starts on Monday because that is how the work is talked about. */
function weekStart(k: string): string {
  const d = parseKey(k);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return keyOf(d);
}
function monthStart(k: string): string {
  const d = parseKey(k);
  return keyOf(new Date(d.getFullYear(), d.getMonth(), 1));
}
function monthEnd(k: string): string {
  const d = parseKey(k);
  return keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    out.push(k);
    if (out.length > 95) break;
  }
  return out;
}

/* ---------------------------------------------------------------- */

type View = "DAY" | "WEEK" | "MONTH";
type StatusFilter = "" | "available" | "busy" | "away";
type LoadFilter = "" | "free" | "light" | "busy" | "heavy";

interface ApiPerson {
  id: string; name: string; avatarUrl: string | null; role: string;
  craft: string | null; craftId: string | null; craftOrder: number;
  blocksOwnDays: boolean;
}
interface ApiBlock {
  id: string; userId: string; date: string; kind: string; reason: string;
  leave: boolean; createdBy: { id: string; name: string } | null; createdAt: string;
}
interface Overview {
  from: string; to: string; seesLoad: boolean; canBlockOthers: boolean;
  people: ApiPerson[]; blocks: ApiBlock[]; load: Record<string, number> | null;
}

export default function AvailabilityPage() {
  const { user: me } = useCurrentUser();
  const confirm = useConfirm();

  const today = useMemo(() => keyOf(new Date()), []);
  const [view, setView] = useState<View>("WEEK");
  const [anchor, setAnchor] = useState(today);
  const [query, setQuery] = useState("");
  const [craft, setCraft] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [load, setLoad] = useState<LoadFilter>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ userId: string; date: string } | null>(null);

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [blocking, setBlocking] = useState<{ userId?: string; from?: string; to?: string } | null>(null);
  const [finding, setFinding] = useState(false);

  // A phone gets the day view, because a seven-column grid on 375px is
  // unreadable and stacking the desktop lists just moves the problem.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setView("DAY");
    }
  }, []);

  /* The window the grid shows, and therefore the window we fetch. The day
     view still loads its whole week so the date strip is not blank. */
  const window_ = useMemo(() => {
    if (view === "MONTH") return { from: monthStart(anchor), to: monthEnd(anchor) };
    const start = weekStart(anchor);
    return { from: start, to: addDays(start, 6) };
  }, [view, anchor]);

  const load_ = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/availability/overview?from=${window_.from}&to=${window_.to}`);
      if (!res.ok) throw new Error(`The server returned ${res.status}.`);
      setData(await res.json());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [window_.from, window_.to]);

  useEffect(() => { setData(null); load_(); }, [load_]);
  // Somebody else's block, or a task moving, changes what this screen says.
  useLiveRefresh(["calendar", "tasks"], load_);

  /* ---- the cells ------------------------------------------------- */

  const days: GridDay[] = useMemo(() => {
    return rangeKeys(window_.from, window_.to).map((k) => {
      const d = parseKey(k);
      return { key: k, dom: d.getDate(), dow: d.getDay(), weekday: WEEKDAY[d.getDay()] };
    });
  }, [window_.from, window_.to]);

  const blockIndex = useMemo(() => {
    const m = new Map<string, ApiBlock>();
    for (const b of data?.blocks ?? []) m.set(`${b.userId}|${b.date}`, b);
    return m;
  }, [data]);

  const cellOf = useCallback((userId: string, date: string): DayCell => {
    const b = blockIndex.get(`${userId}|${date}`);
    return {
      // null, not 0 — "we don't show you workload" is not "they have nothing on".
      load: data?.load ? (data.load[`${userId}|${date}`] ?? 0) : null,
      block: b
        ? { kind: b.kind as UnavailabilityKind, reason: b.reason, leave: b.leave }
        : null,
    };
  }, [blockIndex, data]);

  /** Status and workload filters are asked about ONE day — the focused one. */
  const focusDate = view === "DAY" ? anchor : (selected?.date ?? anchor);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.craft ?? "").toLowerCase().includes(q)) return false;
      if (craft && (p.craft ?? "Team") !== craft) return false;
      if (status || load) {
        const c = cellOf(p.id, focusDate);
        if (status && dayStatus(c) !== status) return false;
        // Somebody blocked has no workload to filter on — a block is the answer.
        if (load && (c.block || loadLevel(c.load ?? 0) !== load)) return false;
      }
      return true;
    });
  }, [data, query, craft, status, load, cellOf, focusDate]);

  const groups: GridGroup[] = useMemo(() => {
    const byCraft = new Map<string, { label: string; order: number; rows: GridGroup["rows"] }>();
    for (const p of people) {
      const label = p.craft ?? "Team";
      if (!byCraft.has(label)) byCraft.set(label, { label, order: p.craftOrder, rows: [] });
      byCraft.get(label)!.rows.push({
        person: { id: p.id, name: p.name, avatarUrl: p.avatarUrl, craft: p.craft },
        cells: days.map((d) => cellOf(p.id, d.key)),
      });
    }
    return [...byCraft.values()]
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map((g) => ({ id: g.label, label: g.label, rows: g.rows }));
  }, [people, days, cellOf]);

  const dayRows: DayRow[] = useMemo(
    () => people.map((p) => ({
      person: { id: p.id, name: p.name, avatarUrl: p.avatarUrl, craft: p.craft },
      cell: cellOf(p.id, anchor),
    })),
    [people, cellOf, anchor],
  );

  /* ---- the counters ---------------------------------------------- */

  const counts = useMemo(() => {
    const all = data?.people ?? [];
    let available = 0, busy = 0, away = 0;
    for (const p of all) {
      const s = dayStatus(cellOf(p.id, focusDate));
      if (s === "available") available++;
      else if (s === "busy") busy++;
      else away++;
    }
    return { total: all.length, available, busy, away };
  }, [data, cellOf, focusDate]);

  const pct = (n: number) => (counts.total ? `${Math.round((n / counts.total) * 100)}%` : "—");

  /* ---- the drawer ------------------------------------------------ */

  const [schedule, setSchedule] = useState<Record<string, Record<string, string[]>>>({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    const date = selected?.date;
    if (!date || !data?.seesLoad || schedule[date] || inflight.current.has(date)) return;
    inflight.current.add(date);
    setScheduleLoading(true);
    fetch(`/api/availability/day?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.people) return;
        const byUser: Record<string, string[]> = {};
        for (const p of d.people) byUser[p.id] = p.on ?? [];
        setSchedule((s) => ({ ...s, [date]: byUser }));
      })
      .catch(() => { /* the drawer still shows availability without it */ })
      .finally(() => { inflight.current.delete(date); setScheduleLoading(false); });
  }, [selected?.date, data?.seesLoad, schedule]);

  const selectedPerson = data?.people.find((p) => p.id === selected?.userId) ?? null;
  const selectedBlock = selected ? blockIndex.get(`${selected.userId}|${selected.date}`) ?? null : null;

  /**
   * Mirrors maySetAvailability on the server. The server is the enforcement —
   * this only decides whether to offer a button that would be refused.
   */
  const canBlockFor = useCallback((userId: string) => {
    if (data?.canBlockOthers) return true;
    return userId === me?.id && !!me?.jobTitle?.blocksOwnDays;
  }, [data?.canBlockOthers, me]);

  const canBlockAnyone = !!data && (data.canBlockOthers || !!me?.jobTitle?.blocksOwnDays);

  async function clearBlock(id: string) {
    const ok = await confirm({
      title: "Free this day up?",
      message: "People will be able to assign work on this day again.",
      confirmLabel: "Free it up",
    });
    if (!ok) return;
    setClearing(true);
    try {
      const res = await fetch(`/api/availability/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Could not remove that");
      toast.success("Day freed up");
      broadcastChange("calendar");
      load_();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that");
    } finally {
      setClearing(false);
    }
  }

  /* ---- chrome ---------------------------------------------------- */

  const crafts = useMemo(
    () => [...new Set((data?.people ?? []).map((p) => p.craft ?? "Team"))].sort(),
    [data],
  );

  const periodLabel = useMemo(() => {
    if (view === "MONTH") {
      const d = parseKey(anchor);
      return `${MONTH[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (view === "DAY") {
      const d = parseKey(anchor);
      return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
    }
    const a = parseKey(window_.from), b = parseKey(window_.to);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MONTH[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()} ${MONTH[a.getMonth()]} – ${b.getDate()} ${MONTH[b.getMonth()]}`;
  }, [view, anchor, window_.from, window_.to]);

  const step = (dir: 1 | -1) => {
    setAnchor((a) => (view === "MONTH"
      ? keyOf(new Date(parseKey(a).getFullYear(), parseKey(a).getMonth() + dir, 1))
      : addDays(a, dir * (view === "DAY" ? 1 : 7))));
  };

  const focusLabel = useMemo(() => {
    const d = parseKey(focusDate);
    return focusDate === today ? "today" : `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
  }, [focusDate, today]);

  const filtersOn = !!(query || craft || status || load);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/[0.08] px-4 sm:px-6 lg:px-8 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Team Availability</h1>
            <p className="text-[12px] text-gray-500 dark:text-slate-400">
              See who can take work before assigning it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canBlockAnyone && (
              <Button
                size="sm" variant="secondary"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setBlocking({ userId: me?.id, from: focusDate, to: focusDate })}
              >
                Block day
              </Button>
            )}
            {data?.seesLoad && (
              <Button size="sm" icon={<Users className="w-3.5 h-3.5" />} onClick={() => setFinding(true)}>
                Find available crew
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* The page itself does not scroll. The chrome keeps its height and the
            grid takes the rest, which is what gives `sticky top-0` on the date
            header something to stick inside — on a page that scrolls as one
            piece, a sticky header just scrolls away with everything else. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-3 space-y-3 flex-shrink-0">

            {/* Counters. Compact, and each one is a filter. */}
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <Kpi label="Team members" value={counts.total} />
              <Kpi
                label={`Available · ${focusLabel}`} value={counts.available} hint={pct(counts.available)}
                dot="bg-emerald-500" active={status === "available"}
                onClick={() => setStatus((s) => (s === "available" ? "" : "available"))}
              />
              <Kpi
                label={`Busy · ${focusLabel}`} value={counts.busy} hint={pct(counts.busy)}
                dot="bg-amber-500" active={status === "busy"}
                onClick={() => setStatus((s) => (s === "busy" ? "" : "busy"))}
              />
              <Kpi
                label={`Unavailable · ${focusLabel}`} value={counts.away} hint={pct(counts.away)}
                dot="bg-rose-500" active={status === "away"}
                onClick={() => setStatus((s) => (s === "away" ? "" : "away"))}
              />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-gray-200 dark:border-white/[0.1] rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                <button
                  type="button" onClick={() => step(-1)} aria-label="Previous"
                  className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2.5 py-1.5 text-[12px] font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap min-w-[10rem] text-center">
                  {periodLabel}
                </span>
                <button
                  type="button" onClick={() => step(1)} aria-label="Next"
                  className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <Button size="sm" variant="secondary" onClick={() => setAnchor(today)} disabled={anchor === today}>
                Today
              </Button>

              <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/[0.1] overflow-hidden bg-white dark:bg-slate-900">
                {(["DAY", "WEEK", "MONTH"] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                      view === v
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    {v.toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[10rem] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search team members…"
                  aria-label="Search team members"
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <Select
                value={craft} onChange={setCraft} allowEmpty placeholder="All roles" size="sm"
                options={crafts.map((c) => ({ value: c, label: c }))}
                className="min-w-[8.5rem]"
              />
              <Select
                value={status} onChange={(v) => setStatus(v as StatusFilter)} allowEmpty placeholder="All statuses" size="sm"
                options={[
                  { value: "available", label: "Available" },
                  { value: "busy", label: "Busy" },
                  { value: "away", label: "Unavailable" },
                ]}
                className="min-w-[8.5rem]"
              />
              {data?.seesLoad && (
                <Select
                  value={load} onChange={(v) => setLoad(v as LoadFilter)} allowEmpty placeholder="All workloads" size="sm"
                  options={[
                    { value: "free", label: "Nothing on" },
                    { value: "light", label: "1 job" },
                    { value: "busy", label: "2 jobs" },
                    { value: "heavy", label: "Heavily booked" },
                  ]}
                  className="min-w-[9rem]"
                />
              )}
              {filtersOn && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setCraft(""); setStatus(""); setLoad(""); }}
                  className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X className="w-3 h-3" aria-hidden /> Clear
                </button>
              )}
            </div>

            {(status || load) && view !== "DAY" && (
              <p className="text-[11px] text-gray-400">
                Status and workload filters apply to {focusLabel}
                {selected ? " — the day you have open" : ""}.
              </p>
            )}

          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 flex flex-col gap-2 px-4 sm:px-6 lg:px-8 pb-4">
            {error ? (
              <LoadError message="Couldn't load availability" detail={error} onRetry={load_} />
            ) : !data ? (
              <div className="h-80 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
            ) : data.people.length === 0 ? (
              <Empty
                title="Nobody on the team yet"
                hint="Once people are added under People, their days appear here."
              />
            ) : people.length === 0 ? (
              <Empty
                title="Nobody matches these filters"
                hint="Clear a filter to see the rest of the team."
              />
            ) : view === "DAY" ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <DayBoard
                  date={anchor}
                  today={today}
                  strip={rangeKeys(window_.from, window_.to).map((k) => {
                    const d = parseKey(k);
                    return { key: k, dom: d.getDate(), weekday: WEEKDAY[d.getDay()] };
                  })}
                  rows={dayRows}
                  selectedUserId={selected?.userId ?? null}
                  onPickDate={(d) => { setAnchor(d); setSelected((s) => (s ? { ...s, date: d } : null)); }}
                  onStepDay={(n) => setAnchor((a) => addDays(a, n))}
                  onSelect={(userId) => setSelected({ userId, date: anchor })}
                />
              </div>
            ) : (
              <AvailabilityGrid
                className="flex-1 min-h-0"
                days={days}
                groups={groups}
                today={today}
                dense={view === "MONTH"}
                selected={selected}
                onSelect={(userId, date) => setSelected({ userId, date })}
                collapsed={collapsed}
                onToggleGroup={(id) => setCollapsed((s) => {
                  const next = new Set(s);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
              />
            )}

            {data && data.people.length > 0 && (
              <div className="flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
                <Legend seesLoad={data.seesLoad} />
                {view !== "DAY" && (
                  <p className="hidden lg:flex items-center gap-1 text-[11px] text-gray-400">
                    <CalendarDays className="w-3 h-3" aria-hidden />
                    Arrow keys move around the grid
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Details, beside the grid on a wide screen and over it on a phone. */}
        {selected && selectedPerson && (
          <div className="fixed inset-0 z-40 bg-white dark:bg-slate-950 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:w-[340px] lg:flex-shrink-0">
            <PersonDayDrawer
              person={{
                id: selectedPerson.id, name: selectedPerson.name,
                avatarUrl: selectedPerson.avatarUrl, craft: selectedPerson.craft,
              }}
              date={selected.date}
              cell={cellOf(selected.userId, selected.date)}
              block={selectedBlock}
              seesLoad={!!data?.seesLoad}
              schedule={schedule[selected.date]?.[selected.userId] ?? null}
              scheduleLoading={scheduleLoading && !schedule[selected.date]}
              canBlock={canBlockFor(selected.userId)}
              clearing={clearing}
              onClose={() => setSelected(null)}
              onStepDay={(n) => setSelected((s) => (s ? { ...s, date: addDays(s.date, n) } : s))}
              onBlockThisDay={() => setBlocking({ userId: selected.userId, from: selected.date, to: selected.date })}
              onClear={clearBlock}
            />
          </div>
        )}
      </div>

      <BlockDaysDialog
        open={!!blocking}
        onClose={() => setBlocking(null)}
        meId={me?.id ?? ""}
        people={
          data?.canBlockOthers
            ? (data?.people ?? []).map((p) => ({ id: p.id, name: p.name }))
            : me ? [{ id: me.id, name: me.name }] : []
        }
        initial={blocking}
        onSaved={() => {
          toast.success("Days blocked");
          broadcastChange("calendar");
          load_();
        }}
      />

      <FindCrewDialog
        open={finding}
        onClose={() => setFinding(false)}
        defaultDate={focusDate}
        crafts={crafts}
        onAssigned={() => {
          toast.success("Task assigned");
          broadcastChange("tasks");
          load_();
        }}
      />
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 py-12 text-center">
      <p className="text-sm font-medium text-gray-700 dark:text-slate-200">{title}</p>
      <p className="text-[12px] text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
