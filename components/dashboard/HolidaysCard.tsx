"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Panel, DayBlock, Row, Empty, Pill } from "./kit";

type Holiday = { id: string; name: string; date: string; endDate?: string | null };

/** Shown on the dashboard. Long enough to be useful, short enough to ignore. */
const ON_DASHBOARD = 4;

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
export function HolidaysCard() {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [managing, setManaging] = useState(false);
  /**
   * The request did not come back.
   *
   * Tracked separately from "came back empty", because the card used to
   * treat them the same and simply disappear — so a failing endpoint looked
   * exactly like a workspace with no holidays, and the only way to tell them
   * apart was to open the network tab.
   */
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetch("/api/holidays?upcoming=1")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        setHolidays(d.holidays ?? []);
        setCanManage(!!d.canManage);
        setFailed(false);
      })
      .catch(() => { setFailed(true); setHolidays([]); });
  }, []);

  useEffect(load, [load]);

  // Only while the first request is in flight. After that the card is always
  // on the page.
  //
  // It used to hide itself when the list came back empty and the viewer could
  // not add anything — which meant a workspace that had not listed its
  // holidays yet was indistinguishable from a broken feature, and the only
  // way to tell was to open the network tab. A reference list that is
  // sometimes absent is worse than one that is briefly empty: the empty state
  // lasts until somebody fills it in once, and then never again.
  if (!holidays) return null;

  const extra = holidays.length - ON_DASHBOARD;

  return (
    <>
      <Panel
        icon={<CalendarDays className="w-4.5 h-4.5" />}
        title="Upcoming Holidays"
        subtitle="This year"
      >
        {/* The Manage affordance is a button, not a link — it opens a dialog.
            Rendered here so the panel header keeps one shape for everyone. */}
        {canManage && (
          <button
            onClick={() => setManaging(true)}
            className="absolute top-4 right-4 sm:right-5 text-xs font-medium text-indigo-600 hover:underline"
          >
            Manage
          </button>
        )}

        {failed ? (
          <div className="px-4 sm:px-5 pb-4 flex items-start gap-2">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">
              Holidays could not be loaded just now.
            </p>
            <button onClick={load} className="text-xs font-medium text-indigo-600 hover:underline flex-shrink-0">
              Try again
            </button>
          </div>
        ) : holidays.length === 0 ? (
          <Empty>
            {canManage
              ? "Nothing listed yet. Add the year’s closures so everyone can see them."
              : "No holidays listed yet."}
          </Empty>
        ) : (
          <>
            <ul className="pb-1">
              {holidays.slice(0, ON_DASHBOARD).map((h) => (
                <Row key={h.id}>
                  <DayBlock iso={h.date} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{h.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{spanRange(h)}</p>
                  </div>
                  <Pill>{spanNote(h)}</Pill>
                </Row>
              ))}
            </ul>
            <footer className="px-4 sm:px-5 py-2.5 border-t border-gray-100 dark:border-white/[0.05] flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <p className="text-[11px] text-gray-400">
                {holidays.length} {holidays.length === 1 ? "holiday" : "holidays"} ahead
              </p>
            </footer>
          </>
        )}
      </Panel>

      {canManage && (
        <HolidayManager
          open={managing}
          onClose={() => { setManaging(false); load(); }}
        />
      )}
    </>
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
