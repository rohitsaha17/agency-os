"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, CheckCircle2, Circle,
  AlertCircle, GripVertical, PanelRightClose, PanelRightOpen, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import { MonthGrid, MONTH_NAMES, isSameDay, getWeekDays, isToday } from "@/components/calendar/MonthGrid";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";
import type { Task } from "@/types";

type View = "day" | "week" | "month";

interface Entry {
  kind: "task" | "content" | "personal" | "event" | "booking";
  id: string;
  date: string;
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

const KIND_STYLE: Record<string, string> = {
  task: "bg-indigo-50 border-indigo-200 text-indigo-800",
  content: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
  personal: "bg-emerald-50 border-emerald-200 text-emerald-800",
  event: "bg-amber-50 border-amber-200 text-amber-800",
  booking: "bg-sky-50 border-sky-200 text-sky-800",
};

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; }

export default function MyCalendarPage() {
  const now = new Date();
  const { user: currentUser } = useCurrentUser();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(now); // day/week anchor
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [overdue, setOverdue] = useState<OverdueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deliveryFor, setDeliveryFor] = useState<{ id: string; title: string } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [queue, setQueue] = useState<Task[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const isSenior =
    currentUser?.role === "ADMIN" || currentUser?.role === "OWNER" ||
    currentUser?.role === "MANAGER" || currentUser?.designation === "HEAD_OF_DESIGN";

  // Visible range per view
  const range = useMemo(() => {
    if (view === "month") {
      return {
        from: new Date(Date.UTC(year, month, -7)).toISOString(),
        to: new Date(Date.UTC(year, month + 1, 7)).toISOString(),
      };
    }
    if (view === "week") {
      const days = getWeekDays(anchor);
      const from = startOfDay(days[0]);
      const to = new Date(startOfDay(days[6]).getTime() + 86400000);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const from = startOfDay(anchor);
    return { from: from.toISOString(), to: new Date(from.getTime() + 86400000).toISOString() };
  }, [view, anchor, year, month]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my-calendar?from=${range.from}&to=${range.to}`);
      const d = await res.json();
      if (res.ok) {
        setEntries(d.entries ?? []);
        setOverdue(d.overdue ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const fetchQueue = useCallback(async () => {
    if (!currentUser) return;
    const res = await fetch("/api/tasks?all=1");
    if (!res.ok) return;
    const d = await res.json();
    const mine = (Array.isArray(d) ? d : [])
      .filter((t: Task) => t.status !== "DONE" &&
        t.assignees?.some((a) => a.userId === currentUser.id || a.user?.id === currentUser.id))
      .sort((a: Task, b: Task) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    setQueue(mine);
  }, [currentUser]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const entriesOn = useCallback(
    (day: Date) => entries.filter((e) => isSameDay(new Date(e.date), day)),
    [entries],
  );

  // Navigation
  const goToday = () => { setAnchor(now); setYear(now.getFullYear()); setMonth(now.getMonth()); };
  const shift = (dir: 1 | -1) => {
    if (view === "month") {
      const m = month + dir;
      if (m < 0) { setYear((y) => y - 1); setMonth(11); }
      else if (m > 11) { setYear((y) => y + 1); setMonth(0); }
      else setMonth(m);
    } else {
      const n = new Date(anchor);
      n.setDate(n.getDate() + dir * (view === "week" ? 7 : 1));
      setAnchor(n);
    }
  };

  const togglePersonal = async (e: Entry) => {
    setEntries((prev) => prev.map((x) => (x.kind === "personal" && x.id === e.id ? { ...x, done: !e.done } : x)));
    await fetch(`/api/personal-items/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !e.done }),
    });
  };

  const persistQueue = async (ids: string[]) => {
    setQueue((prev) => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    const res = await fetch("/api/tasks/my-order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) toast.error("Failed to save order");
  };

  const onDropQueue = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = queue.map((t) => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    persistQueue(ids);
    setDragId(null);
  };

  const renderChip = (e: Entry, detailed = false) => {
    const style = KIND_STYLE[e.kind] ?? KIND_STYLE.task;
    const done = e.kind === "personal" ? e.done : e.status === "DONE";
    return (
      <div key={`${e.kind}-${e.id}`}
        className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 mb-1 ${style} ${done ? "opacity-50" : ""}`}>
        {(e.kind === "task" || e.kind === "personal") && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              if (e.kind === "personal") togglePersonal(e);
              else if (e.status !== "DONE") setDeliveryFor({ id: e.id, title: e.title });
            }}
            className="flex-shrink-0"
          >
            {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 opacity-60" />}
          </button>
        )}
        {e.kind === "content" && <span className="text-xs flex-shrink-0">{e.creativeType?.icon ?? "✨"}</span>}
        {e.time && <span className="text-[10px] font-semibold flex-shrink-0">{e.time}</span>}
        {e.link ? (
          <a href={e.link} onClick={(ev) => ev.stopPropagation()}
            className={`text-[11px] truncate flex-1 hover:underline ${done ? "line-through" : ""}`}>
            {e.title}
          </a>
        ) : (
          <span className={`text-[11px] truncate flex-1 ${done ? "line-through" : ""}`}>{e.title}</span>
        )}
        {detailed && e.clientName && <span className="text-[9px] opacity-60 flex-shrink-0">{e.clientName}</span>}
        {detailed && e.addedBy && (
          <span className="text-[9px] opacity-70 flex-shrink-0 inline-flex items-center gap-0.5">
            <Users className="w-2.5 h-2.5" /> added by {e.addedBy}
          </span>
        )}
      </div>
    );
  };

  const weekDays = getWeekDays(anchor);
  const dayEntries = entriesOn(anchor)
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const timedFirst = [
    ...dayEntries.filter((e) => e.kind === "personal" && e.time),
    ...dayEntries.filter((e) => !(e.kind === "personal" && e.time)),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your tasks, content, and reminders — one daily home</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 font-medium capitalize transition-colors ${view === v ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              Today
            </button>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => shift(-1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[150px] text-center">
                {view === "month" && `${MONTH_NAMES[month]} ${year}`}
                {view === "week" && `Week of ${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                {view === "day" && anchor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <button onClick={() => shift(1)} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add</Button>
            <button onClick={() => setRailOpen((o) => !o)}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hidden lg:block"
              title={railOpen ? "Hide my queue" : "Show my queue"}>
              {railOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main area */}
        <div className="flex-1 px-3 sm:px-6 py-4 overflow-auto min-w-0">
          {/* MONTH */}
          {view === "month" && (
            <MonthGrid
              view="month"
              year={year}
              month={month}
              loading={loading}
              onDayClick={(day) => { setAnchor(day); setView("day"); }}
              cellCount={(day) => entriesOn(day).length}
              renderCell={(day) => {
                const list = entriesOn(day);
                return (
                  <>
                    {list.slice(0, 3).map((e) => renderChip(e))}
                    {list.length > 3 && <span className="text-[9px] text-gray-400">+{list.length - 3} more</span>}
                  </>
                );
              }}
            />
          )}

          {/* WEEK — 7 columns, today highlighted */}
          {view === "week" && (
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
              {weekDays.map((day, i) => {
                const today = isToday(day);
                const list = entriesOn(day);
                return (
                  <div key={i}
                    onClick={() => { setAnchor(day); setView("day"); }}
                    className={`min-h-[320px] p-2 cursor-pointer transition-colors ${today ? "bg-indigo-50/60" : "bg-white hover:bg-gray-50"}`}>
                    <div className="text-center mb-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase">{day.toLocaleDateString("en-US", { weekday: "short" })}</p>
                      <span className={`inline-flex w-7 h-7 items-center justify-center text-sm font-semibold rounded-full ${today ? "bg-indigo-600 text-white" : "text-gray-700"}`}>
                        {day.getDate()}
                      </span>
                    </div>
                    {loading ? <div className="h-4 bg-gray-100 rounded animate-pulse" /> : list.map((e) => renderChip(e))}
                  </div>
                );
              })}
            </div>
          )}

          {/* DAY — agenda list */}
          {view === "day" && (
            <div className="max-w-2xl space-y-4">
              {/* Overdue strip */}
              {overdue.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-3.5 h-3.5" /> Overdue / yesterday
                  </p>
                  <ul className="space-y-1">
                    {overdue.map((o) => (
                      <li key={`${o.kind}-${o.id}`} className="flex items-center gap-2 text-xs text-red-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        {o.link ? <a href={o.link} className="hover:underline truncate">{o.title}</a> : <span className="truncate">{o.title}</span>}
                        <span className="text-red-400 flex-shrink-0 ml-auto">
                          {new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {loading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
              ) : timedFirst.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nothing on your plate this day.</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  {timedFirst.map((e) => renderChip(e, true))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail: My queue */}
        {railOpen && (
          <div className="hidden lg:block w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-4">
              <p className="text-xs font-semibold text-gray-700 mb-1">My queue</p>
              <p className="text-[10px] text-gray-400 mb-3">Drag to reorder — saved to your profile.</p>
              {queue.length === 0 ? (
                <p className="text-xs text-gray-400">No open tasks assigned to you.</p>
              ) : (
                <ul className="space-y-1.5">
                  {queue.map((t) => (
                    <li key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropQueue(t.id)}
                      className={`flex items-center gap-2 border border-gray-100 rounded-lg px-2 py-2 bg-white hover:border-indigo-200 ${dragId === t.id ? "opacity-40" : ""}`}>
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 cursor-grab flex-shrink-0" />
                      <a href={t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`}
                        className="text-xs text-gray-700 truncate flex-1 hover:text-indigo-600">
                        {t.title}
                      </a>
                      {t.dueDate && (
                        <span className="text-[9px] text-gray-400 flex-shrink-0">
                          {new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add dialog */}
      {addOpen && (
        <AddPersonalDialog
          isSenior={isSenior}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); fetchEntries(); }}
        />
      )}

      {/* Delivery dialog for completing tasks from the calendar */}
      {deliveryFor && (
        <DeliveryDialog
          taskId={deliveryFor.id}
          taskTitle={deliveryFor.title}
          onClose={() => setDeliveryFor(null)}
          onCompleted={() => { setDeliveryFor(null); fetchEntries(); fetchQueue(); }}
        />
      )}
    </div>
  );
}

// ── Add personal reminder dialog ─────────────────────────────

function AddPersonalDialog({
  isSenior, onClose, onSaved,
}: {
  isSenior: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"self" | "teammate">("self");
  const [teammates, setTeammates] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    title: "", date: new Date().toISOString().slice(0, 10), time: "", note: "", userId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSenior) {
      fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTeammates(d); });
    }
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
          title: form.title, date: form.date, time: form.time || null,
          note: form.note || null,
          ...(mode === "teammate" && { userId: form.userId }),
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
