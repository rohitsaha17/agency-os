"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, Pencil, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { MonthGrid, MONTH_NAMES } from "@/components/calendar/MonthGrid";
import { Panel, DayBlock, Row, Empty, Pill } from "./kit";

type Holiday = { id: string; name: string; date: string; endDate?: string | null };

/** One field, one spelling. The dialog had four copies of this string. */
const FIELD =
  "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 " +
  "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

/**
 * The days the office is closed.
 *
 * Purely informational, and it stays that way. It does not move a deadline,
 * exclude a day from availability or touch attendance — a wall calendar with
 * opinions is a scheduling system nobody asked for, and the moment a holiday
 * shifts a due date somebody has to reason about which holidays count.
 *
 * Everyone reads it. Adding and removing is settings.manage, which is exactly
 * owner, admin and manager, and the server checks that again on every write
 * rather than trusting that the button was hidden.
 */
/** First-of-month for a given Date, so month maths never trips on the 31st. */
function firstOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Does a holiday (single day or a span) touch the given month? */
function touchesMonth(h: Holiday, year: number, month0: number): boolean {
  const mm = String(month0 + 1).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const lastDate = new Date(year, month0 + 1, 0).getDate();
  const end = `${year}-${mm}-${String(lastDate).padStart(2, "0")}`;
  // ISO strings compare correctly as text — no Date, no timezone.
  return h.date <= end && (h.endDate ?? h.date) >= start;
}

function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function HolidaysCard() {
  /**
   * Holidays are kept per year, filled in as the viewer walks across the
   * boundary — flipping from December into January fetches next year once and
   * remembers it. A full list of the year would overflow the card the moment a
   * workspace lists all its closures, so the card shows one month at a time
   * (the user's ask) and "View all" opens the whole year as a calendar.
   */
  const [byYear, setByYear] = useState<Record<number, Holiday[]>>({});
  const [canManage, setCanManage] = useState(false);
  const [managing, setManaging] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /**
   * The request did not come back. Tracked apart from "came back empty" so a
   * failing endpoint doesn't read as a workspace with no holidays.
   */
  const [failed, setFailed] = useState(false);
  /** True once the first request settles — until then the card is absent, not empty. */
  const [ready, setReady] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => firstOf(new Date()));

  const viewYear = viewMonth.getFullYear();

  const loadYear = useCallback((year: number) => {
    fetch(`/api/holidays?year=${year}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        setByYear((prev) => ({ ...prev, [year]: d.holidays ?? [] }));
        setCanManage(!!d.canManage);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (byYear[viewYear] === undefined) loadYear(viewYear);
  }, [viewYear, byYear, loadYear]);

  // After Manage closes, the edited year may need re-reading.
  const reloadCurrent = useCallback(() => loadYear(viewYear), [loadYear, viewYear]);

  // Only while the very first request is in flight.
  if (!ready) return null;

  const step = (delta: number) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const yearHolidays = byYear[viewYear];
  const loadingThisYear = yearHolidays === undefined && !failed;
  const monthHolidays = (yearHolidays ?? [])
    .filter((h) => touchesMonth(h, viewYear, viewMonth.getMonth()))
    .sort((a, b) => a.date.localeCompare(b.date));
  const yearCount = (yearHolidays ?? []).length;
  const onThisMonth = viewMonth.getTime() === firstOf(new Date()).getTime();

  return (
    <>
      <Panel
        icon={<CalendarDays className="w-4.5 h-4.5" />}
        title="Holidays"
      >
        {/* The Manage affordance is a button, not a link — it opens a dialog. */}
        {canManage && (
          <button
            onClick={() => setManaging(true)}
            className="absolute top-4 right-4 sm:right-5 text-xs font-medium text-indigo-600 hover:underline"
          >
            Manage
          </button>
        )}

        {/* Month stepper — the card's whole point is that one month never
            overflows however many holidays a year has. */}
        <div className="flex items-center gap-1 px-4 sm:px-5 pb-2">
          <button
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-gray-700 dark:text-slate-200 text-center min-w-[8.5rem] tabular-nums">
            {monthLabel(viewMonth)}
          </span>
          <button
            onClick={() => step(1)}
            aria-label="Next month"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!onThisMonth && (
            <button
              onClick={() => setViewMonth(firstOf(new Date()))}
              className="ml-1 text-[11px] font-medium text-indigo-600 hover:underline"
            >
              Today
            </button>
          )}
        </div>

        {failed && !yearHolidays ? (
          <div className="px-4 sm:px-5 pb-4 flex items-start gap-2">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">
              Holidays could not be loaded just now.
            </p>
            <button onClick={reloadCurrent} className="text-xs font-medium text-indigo-600 hover:underline flex-shrink-0">
              Try again
            </button>
          </div>
        ) : loadingThisYear ? (
          <p className="px-4 sm:px-5 pb-4 text-xs text-gray-400">Loading…</p>
        ) : monthHolidays.length === 0 ? (
          <Empty>No holidays in {monthLabel(viewMonth)}.</Empty>
        ) : (
          <ul className="pb-1">
            {monthHolidays.map((h) => (
              <Row key={h.id}>
                <DayBlock iso={h.date} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{h.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{spanRange(h)}</p>
                </div>
                <Pill>{spanNote(h)}</Pill>
              </Row>
            ))}
          </ul>
        )}

        <footer className="px-4 sm:px-5 py-2.5 border-t border-gray-100 dark:border-white/[0.05] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0">
            <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">
              {yearCount} {yearCount === 1 ? "holiday" : "holidays"} in {viewYear}
            </span>
          </span>
          <button
            onClick={() => setShowAll(true)}
            className="text-xs font-medium text-indigo-600 hover:underline flex-shrink-0"
          >
            View all
          </button>
        </footer>
      </Panel>

      {canManage && (
        <HolidayManager
          open={managing}
          onClose={() => { setManaging(false); reloadCurrent(); }}
        />
      )}

      <HolidayCalendarModal
        open={showAll}
        onClose={() => setShowAll(false)}
        initialMonth={viewMonth}
      />
    </>
  );
}

/**
 * "View all" — the whole year as a calendar plus a list, so a busy year is
 * readable instead of a scroll of forty rows squeezed into a card.
 *
 * Reads holidays itself (by year, cached as you page across a boundary) so it
 * doesn't have to be handed the parent's state. The grid is the shared
 * MonthGrid every calendar in the app uses; holidays ride its event-strip lane,
 * the closure's name shown once on its first day.
 */
function HolidayCalendarModal({
  open, onClose, initialMonth,
}: { open: boolean; onClose: () => void; initialMonth: Date }) {
  const [month, setMonth] = useState(initialMonth);
  const [byYear, setByYear] = useState<Record<number, Holiday[]>>({});
  const [failed, setFailed] = useState(false);

  const year = month.getFullYear();

  // Re-centre on the month the card was showing each time it opens.
  useEffect(() => { if (open) setMonth(initialMonth); }, [open, initialMonth]);

  useEffect(() => {
    if (!open || byYear[year] !== undefined) return;
    let alive = true;
    fetch(`/api/holidays?year=${year}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) { setByYear((p) => ({ ...p, [year]: d.holidays ?? [] })); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, year, byYear]);

  const holidays = byYear[year] ?? [];
  const monthHolidays = holidays
    .filter((h) => touchesMonth(h, year, month.getMonth()))
    .sort((a, b) => a.date.localeCompare(b.date));

  const step = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <Modal open={open} onClose={onClose} title="Holidays" width="max-w-2xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-100 text-center min-w-[9.5rem] tabular-nums">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => step(1)}
              aria-label="Next month"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setMonth(firstOf(new Date()))}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Today
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <MonthGrid
            view="month"
            year={year}
            month={month.getMonth()}
            renderCell={() => null}
            renderStrip={(day, { inMonth }) => {
              if (!inMonth) return null;
              const iso = day.toLocaleDateString("en-CA"); // local YYYY-MM-DD
              const h = holidays.find((x) => iso >= x.date && iso <= (x.endDate ?? x.date));
              if (!h) return null;
              const isStart = iso === h.date;
              return (
                <div
                  title={h.name}
                  className="mx-0.5 mb-0.5 h-4 rounded px-1 text-[10px] leading-4 truncate bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-100"
                >
                  {isStart ? h.name : " "}
                </div>
              );
            }}
          />
        </div>

        {failed && holidays.length === 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 text-center py-2">
            Holidays could not be loaded just now.
          </p>
        ) : monthHolidays.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">
            No holidays in {monthLabel(month)}.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
            {monthHolidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2">
                <DayBlock iso={h.date} />
                <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-slate-200 truncate">{h.name}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                  {spanRange(h)} · {spanNote(h)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** The whole year, with a row to add one and a bin on each. */
function HolidayManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  /** Optional. Empty means the closure is one day. */
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** Which row is open for correction, and what it currently says. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const startEdit = (h: Holiday) => {
    setError("");
    setEditingId(h.id);
    setEditName(h.name);
    setEditDate(h.date);
    setEditEnd(h.endDate ?? "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/holidays/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, date: editDate, endDate: editEnd || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Could not save that");
      setRows((prev) => prev
        .map((r) => (r.id === d.id ? d : r))
        .sort((a, b) => a.date.localeCompare(b.date)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  };

  const year = new Date().getFullYear();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/holidays?year=${year}`)
      .then((r) => (r.ok ? r.json() : { holidays: [] }))
      .then((d) => setRows(d.holidays ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const add = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, endDate: endDate || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Could not add that");
      setRows((prev) => [...prev, d].sort((a, b) => a.date.localeCompare(b.date)));
      setName("");
      setDate("");
      setEndDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    // Gone from the list immediately; the reload on failure is what puts it
    // back, so a dropped request cannot leave the screen lying.
    setRows((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/holidays/${id}`, { method: "DELETE" }).catch(() => load());
  };

  return (
    <Modal open={open} onClose={onClose} title={`Holidays ${year}`} width="max-w-xl">
      <div className="space-y-4">
        {/*
          Two rows, not one.

          Four controls abreast — two dates, a name and a button — did not fit
          the dialog and pushed a horizontal scrollbar under it, which is the
          one direction nobody expects a form to move in. The dates share a
          row because they are one question; the name gets the width it needs
          because it is the only free text here.

          Both dates are labelled. Two identical dd-mm-yyyy boxes said nothing
          about which was which, or that the second one is optional.
        */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">
                First day
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="block min-w-0">
              <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">
                Last day <span className="font-normal text-gray-400 dark:text-slate-500">· optional</span>
              </span>
              <input
                type="date"
                value={endDate}
                min={date || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                title="Leave empty for a single day"
                className={FIELD}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && date && !busy) add(); }}
              placeholder="Diwali"
              aria-label="Holiday name"
              maxLength={80}
              className={`flex-1 min-w-0 ${FIELD}`}
            />
            <button
              onClick={add}
              disabled={busy || !name.trim() || !date}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <p className="text-xs text-gray-500 py-4 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">
            Nothing listed for {year} yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {rows.map((h) => editingId === h.id ? (
              /* The same three fields as adding one, in the row's place —
                 a dialog on top of a dialog to change a spelling is worse
                 than the typo. */
              <li key={h.id} className="py-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={editDate} aria-label="First day"
                    onChange={(e) => setEditDate(e.target.value)} className={FIELD} />
                  <input type="date" value={editEnd} min={editDate || undefined} aria-label="Last day"
                    onChange={(e) => setEditEnd(e.target.value)} className={FIELD} />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={editName} maxLength={80} aria-label="Holiday name"
                    onChange={(e) => setEditName(e.target.value)} className={`flex-1 min-w-0 ${FIELD}`} />
                  <button onClick={saveEdit} disabled={busy || !editName.trim() || !editDate}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex-shrink-0">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 flex-shrink-0">
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={h.id} className="flex items-center gap-3 py-2">
                <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 tabular-nums w-[5.5rem] flex-shrink-0">
                  {spanRange(h)}
                </span>
                <span className="text-sm text-gray-700 dark:text-slate-300 min-w-0 truncate">{h.name}</span>
                <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">{spanNote(h)}</span>
                <button
                  onClick={() => startEdit(h)}
                  aria-label={`Edit ${h.name}`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(h.id)}
                  aria-label={`Remove ${h.name}`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "2 Oct" from "YYYY-MM-DD", read as plain numbers.
 *
 * Not toLocaleDateString: that wants a Date, a Date carries a zone, and a
 * holiday has none. Parsing "2026-10-02" and formatting it locally is exactly
 * how the 2nd comes out as the 1st for anybody west of the office.
 */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

/** "2 Oct", or "20–22 Oct" when a closure runs over several days. */
function spanRange(h: Holiday): string {
  if (!h.endDate || h.endDate === h.date) return dayLabel(h.date);
  const [, m1, d1] = h.date.split("-").map(Number);
  const [, m2, d2] = h.endDate.split("-").map(Number);
  // Inside one month the month is said once: 20–22 Oct, not 20 Oct – 22 Oct.
  return m1 === m2
    ? `${d1}–${d2} ${MONTHS[m1 - 1] ?? ""}`
    : `${dayLabel(h.date)}–${dayLabel(h.endDate)}`;
}

/**
 * The weekday for one day; how many days for a range.
 *
 * A range's weekday is the less useful fact — "Mon" says nothing about a
 * closure that also covers Tuesday and Wednesday, where the length is the
 * thing being asked about.
 */
function spanNote(h: Holiday): string {
  if (!h.endDate || h.endDate === h.date) return weekday(h.date);
  const [y1, m1, d1] = h.date.split("-").map(Number);
  const [y2, m2, d2] = h.endDate.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  ) + 1;
  return `${days} days`;
}

/** Which weekday it lands on — the first thing anybody wants to know. */
function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}
