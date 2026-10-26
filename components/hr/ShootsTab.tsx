"use client";

/**
 * Shoots — the team's shoot diary.
 *
 * A shoot is a named outing for a window of a day, with one or more people on
 * it. This is the sister of Team availability: that board answers "who can take
 * work on the 4th" at day grain; this one answers "who is out shooting, and
 * when" at time-of-day grain, which is the thing a day cell cannot show.
 *
 * So the shape is a week laid out as days across the top and the hours of the
 * day down the side, each shoot drawn as a block where it actually sits — the
 * grid the request asked for. A phone gets the same data as an agenda list,
 * because a seven-column time grid on 375px is unreadable.
 *
 * It does not enforce anything. Booking a shoot blocks assignment on that day;
 * the enforcement is the assignment guard on the server (lib/assignment-guard),
 * not this screen. If the two ever disagree, the server is right.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, ChevronLeft, ChevronRight, Clock, MapPin, Users, Camera, Trash2, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LoadError } from "@/components/ui/LoadError";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import {
  timeRangeLabel, formatTime12, visibleHourRange, initials,
} from "@/lib/shoots";
import { ShootDialog } from "@/components/shoots/ShootDialog";

/* ---- dates, in the viewer's own calendar (same approach as Team availability) ---- */
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
function weekStart(k: string): string {
  const d = parseKey(k);
  const shift = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - shift);
  return keyOf(d);
}
function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) { out.push(k); if (out.length > 60) break; }
  return out;
}
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Person { id: string; name: string; avatarUrl: string | null; }
interface Shoot {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  location: string | null;
  createdBy: { id: string; name: string } | null;
  participants: Person[];
}

type View = "WEEK" | "LIST";
const HOUR_PX = 56;

/** Side-by-side layout for shoots that overlap in one day column. */
function layoutDay(shoots: Shoot[]): { shoot: Shoot; lane: number; lanes: number }[] {
  const sorted = [...shoots].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const out: { shoot: Shoot; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };

  for (const s of sorted) {
    if (cluster.length && s.startMinute >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s.startMinute);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endMinute); }
    else laneEnds[lane] = s.endMinute;
    cluster.push({ shoot: s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.endMinute);
  }
  flush();
  return out;
}

export function ShootsTab() {
  const { user: me } = useCurrentUser();
  const confirm = useConfirm();

  const today = useMemo(() => keyOf(new Date()), []);
  const [view, setView] = useState<View>("WEEK");
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<Shoot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date?: string } | null>(null);
  const [open, setOpen] = useState<Shoot | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // A phone gets the agenda list.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setView("LIST");
    }
  }, []);

  const window_ = useMemo(() => {
    const start = weekStart(anchor);
    return { from: start, to: addDays(start, 6) };
  }, [anchor]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/shoots?from=${window_.from}&to=${window_.to}`);
      if (!res.ok) throw new Error(`The server returned ${res.status}.`);
      setData(await res.json());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [window_.from, window_.to]);

  useEffect(() => { setData(null); load(); }, [load]);
  // A shoot booked elsewhere, or a task moving, changes what this shows.
  useLiveRefresh(["calendar", "tasks"], load);

  const days = useMemo(() => rangeKeys(window_.from, window_.to), [window_.from, window_.to]);
  const byDay = useMemo(() => {
    const m = new Map<string, Shoot[]>();
    for (const s of data ?? []) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return m;
  }, [data]);

  const { startHour, endHour } = useMemo(
    () => visibleHourRange(data ?? []),
    [data],
  );
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = startHour; h <= endHour; h++) out.push(h);
    return out;
  }, [startHour, endHour]);

  const periodLabel = useMemo(() => {
    const a = parseKey(window_.from), b = parseKey(window_.to);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MONTH[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()} ${MONTH[a.getMonth()]} – ${b.getDate()} ${MONTH[b.getMonth()]} ${b.getFullYear()}`;
  }, [window_.from, window_.to]);

  const total = data?.length ?? 0;

  const canCancel = useCallback((s: Shoot) => {
    if (!me) return false;
    if (me.role === "OWNER" || me.role === "ADMIN") return true;
    if (s.createdBy?.id === me.id) return true;
    return s.participants.some((p) => p.id === me.id);
  }, [me]);

  async function cancelShoot(s: Shoot) {
    const ok = await confirm({
      title: "Cancel this shoot?",
      message: `"${s.title}" on ${dayLabel(s.date)} will be removed for everyone on it. Work can be assigned on that day again.`,
      confirmLabel: "Cancel shoot",
      variant: "danger",
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/shoots/${s.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Could not cancel that");
      toast.success("Shoot cancelled");
      broadcastChange("calendar");
      setOpen(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel that");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Shoots</h2>
          <p className="text-[12px] text-gray-500 dark:text-slate-400">
            Mark when you&rsquo;re out on a shoot so nobody books you over it. Add yourself, a colleague, or both.
          </p>
        </div>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding({ date: today })}>
          Add shoot
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center border border-gray-200 dark:border-white/[0.1] rounded-lg overflow-hidden bg-white dark:bg-slate-900">
          <button type="button" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Previous week"
            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2.5 py-1.5 text-[12px] font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap min-w-[11rem] text-center">
            {periodLabel}
          </span>
          <button type="button" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Next week"
            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAnchor(today)} disabled={weekStart(anchor) === weekStart(today)}>
          This week
        </Button>
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/[0.1] overflow-hidden bg-white dark:bg-slate-900">
          {(["WEEK", "LIST"] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                view === v ? "bg-indigo-600 text-white" : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
              }`}>
              {v === "WEEK" ? "Week" : "List"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-gray-400">
          {total} shoot{total === 1 ? "" : "s"} this week
        </span>
      </div>

      {/* Content */}
      {error ? (
        <LoadError message="Couldn't load shoots" detail={error} onRetry={load} />
      ) : !data ? (
        <div className="h-96 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
      ) : view === "LIST" ? (
        <AgendaList
          days={days} today={today} byDay={byDay}
          onOpen={setOpen} onAdd={(d) => setAdding({ date: d })}
        />
      ) : (
        <WeekGrid
          days={days} today={today} hours={hours} startHour={startHour} endHour={endHour}
          byDay={byDay} onOpen={setOpen} onAddOnDay={(d) => setAdding({ date: d })}
        />
      )}

      {/* Add dialog */}
      <ShootDialog
        open={!!adding}
        onClose={() => setAdding(null)}
        meId={me?.id ?? ""}
        initialDate={adding?.date}
        onSaved={() => {
          toast.success("Shoot booked");
          broadcastChange("calendar");
          load();
        }}
      />

      {/* Details */}
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.title} width="max-w-md"
          footer={
            <div className="flex items-center justify-between gap-2 w-full">
              {canCancel(open) ? (
                <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />}
                  loading={cancelling} onClick={() => cancelShoot(open)}>
                  Cancel shoot
                </Button>
              ) : <span />}
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>Close</Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <Row icon={<CalendarDays className="w-4 h-4" />} text={dayLabel(open.date)} />
            <Row icon={<Clock className="w-4 h-4" />} text={timeRangeLabel(open.startMinute, open.endMinute)} />
            {open.location && <Row icon={<MapPin className="w-4 h-4" />} text={open.location} />}
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" aria-hidden />
              <div className="flex flex-wrap gap-1.5">
                {open.participants.map((p) => (
                  <span key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-white/[0.08] pl-1 pr-2.5 py-0.5 text-[12px] text-gray-700 dark:text-slate-200">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-semibold" aria-hidden>
                      {initials(p.name)}
                    </span>
                    {p.name}{p.id === me?.id ? " (you)" : ""}
                  </span>
                ))}
              </div>
            </div>
            {open.createdBy && (
              <p className="text-[11px] text-gray-400 pt-1">
                Added by {open.createdBy.id === me?.id ? "you" : open.createdBy.name}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-gray-700 dark:text-slate-200">
      <span className="text-gray-400 shrink-0" aria-hidden>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function dayLabel(key: string): string {
  const d = parseKey(key);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------------------------------------------------------------- *
 * Week grid — days across, hours down.
 * ---------------------------------------------------------------- */
function WeekGrid({
  days, today, hours, startHour, endHour, byDay, onOpen, onAddOnDay,
}: {
  days: string[]; today: string; hours: number[]; startHour: number; endHour: number;
  byDay: Map<string, Shoot[]>; onOpen: (s: Shoot) => void; onAddOnDay: (d: string) => void;
}) {
  const trackHeight = (endHour - startHour) * HOUR_PX;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 overflow-x-auto">
      <div className="min-w-[48rem]">
        {/* Day header row */}
        <div className="grid sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/[0.08]"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-r border-gray-100 dark:border-white/[0.06]" />
          {days.map((k) => {
            const d = parseKey(k);
            const isToday = k === today;
            return (
              <button key={k} type="button" onClick={() => onAddOnDay(k)}
                title="Add a shoot on this day"
                className={`px-2 py-2 text-center border-r border-gray-100 dark:border-white/[0.06] last:border-r-0 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 transition-colors ${
                  isToday ? "bg-indigo-50/60 dark:bg-indigo-500/10" : ""
                }`}>
                <div className="text-[10px] uppercase tracking-wide text-gray-400">{WEEKDAY[d.getDay()]}</div>
                <div className={`text-sm font-semibold ${isToday ? "text-indigo-600 dark:text-indigo-300" : "text-gray-800 dark:text-slate-100"}`}>
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>

        {/* Body: hour labels + day tracks */}
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          {/* Hour gutter */}
          <div className="relative border-r border-gray-100 dark:border-white/[0.06]" style={{ height: trackHeight }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute left-0 right-0 pr-1.5 text-right text-[10px] text-gray-400 -translate-y-1/2"
                style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : formatTime12(h * 60)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((k) => {
            const laidOut = layoutDay(byDay.get(k) ?? []);
            return (
              <div key={k} className="relative border-r border-gray-100 dark:border-white/[0.06] last:border-r-0"
                style={{ height: trackHeight }}>
                {/* hour grid lines */}
                {hours.map((h, i) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-gray-100 dark:border-white/[0.05]"
                    style={{ top: i * HOUR_PX }} aria-hidden />
                ))}
                {/* shoots */}
                {laidOut.map(({ shoot, lane, lanes }) => {
                  const top = ((shoot.startMinute - startHour * 60) / 60) * HOUR_PX;
                  const height = Math.max(22, ((shoot.endMinute - shoot.startMinute) / 60) * HOUR_PX);
                  const widthPct = 100 / lanes;
                  return (
                    <button key={shoot.id} type="button" onClick={() => onOpen(shoot)}
                      title={`${shoot.title} · ${timeRangeLabel(shoot.startMinute, shoot.endMinute)}`}
                      className="absolute rounded-md border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-left px-1.5 py-1 overflow-hidden transition-colors"
                      style={{
                        top: top + 1,
                        height: height - 2,
                        left: `calc(${lane * widthPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}>
                      <span className="block text-[11px] font-semibold text-indigo-800 dark:text-indigo-200 truncate leading-tight">
                        {shoot.title}
                      </span>
                      <span className="block text-[10px] text-indigo-600/90 dark:text-indigo-300/90 truncate">
                        {formatTime12(shoot.startMinute)}
                      </span>
                      {height > 44 && (
                        <span className="mt-0.5 flex -space-x-1">
                          {shoot.participants.slice(0, 4).map((p) => (
                            <span key={p.id}
                              className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[8px] font-semibold ring-1 ring-white dark:ring-slate-900"
                              aria-hidden>
                              {initials(p.name)}
                            </span>
                          ))}
                          {shoot.participants.length > 4 && (
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-500/40 text-indigo-800 dark:text-indigo-100 text-[8px] font-semibold ring-1 ring-white dark:ring-slate-900">
                              +{shoot.participants.length - 4}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Agenda list — the same data for phones and anyone who prefers it.
 * ---------------------------------------------------------------- */
function AgendaList({
  days, today, byDay, onOpen, onAdd,
}: {
  days: string[]; today: string; byDay: Map<string, Shoot[]>;
  onOpen: (s: Shoot) => void; onAdd: (d: string) => void;
}) {
  const withShoots = days.filter((k) => (byDay.get(k) ?? []).length > 0);
  if (withShoots.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 py-12 text-center">
        <Camera className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" aria-hidden />
        <p className="text-sm font-medium text-gray-700 dark:text-slate-200">No shoots booked this week</p>
        <p className="text-[12px] text-gray-400 mt-1">Add one so the team knows when you&rsquo;re out.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {withShoots.map((k) => {
        const d = parseKey(k);
        const list = (byDay.get(k) ?? []).sort((a, b) => a.startMinute - b.startMinute);
        return (
          <div key={k}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className={`text-[12px] font-semibold ${k === today ? "text-indigo-600 dark:text-indigo-300" : "text-gray-500 dark:text-slate-400"}`}>
                {WEEKDAY[d.getDay()]} {d.getDate()} {MONTH[d.getMonth()]}{k === today ? " · Today" : ""}
              </h3>
              <button type="button" onClick={() => onAdd(k)}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {list.map((s) => (
                <button key={s.id} type="button" onClick={() => onOpen(s)}
                  className="w-full flex items-start gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 px-3 py-2.5 text-left hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 shrink-0" aria-hidden>
                    <Camera className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{s.title}</span>
                    <span className="block text-[12px] text-gray-500 dark:text-slate-400">
                      {timeRangeLabel(s.startMinute, s.endMinute)}{s.location ? ` · ${s.location}` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {s.participants.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/[0.08] pl-0.5 pr-2 py-0.5 text-[11px] text-gray-600 dark:text-slate-300">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[8px] font-semibold" aria-hidden>
                            {initials(p.name)}
                          </span>
                          {p.name.split(" ")[0]}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
