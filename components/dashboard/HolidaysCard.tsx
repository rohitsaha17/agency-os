"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type Holiday = { id: string; name: string; date: string };

/** Shown on the dashboard. Long enough to be useful, short enough to ignore. */
const ON_DASHBOARD = 4;

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

  const load = useCallback(() => {
    fetch("/api/holidays?upcoming=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHolidays(d.holidays ?? []);
        setCanManage(!!d.canManage);
      })
      .catch(() => { /* a quiet card beats an error where it was */ });
  }, []);

  useEffect(load, [load]);

  if (!holidays) return null;
  // Nothing coming, and nothing you could do about it: show nothing.
  if (!holidays.length && !canManage) return null;

  const extra = holidays.length - ON_DASHBOARD;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            Holidays
          </h2>
          {canManage && (
            <button
              onClick={() => setManaging(true)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Manage
            </button>
          )}
        </div>

        {holidays.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nothing listed yet. Add the year&rsquo;s closures so everyone can see them.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {holidays.slice(0, ON_DASHBOARD).map((h) => (
              <li key={h.id} className="flex items-baseline gap-3 py-1.5 first:pt-0 last:pb-0">
                <span className="text-xs font-semibold text-gray-900 tabular-nums w-[4.5rem] flex-shrink-0">
                  {dayLabel(h.date)}
                </span>
                <span className="text-sm text-gray-700 min-w-0 truncate">{h.name}</span>
                <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">
                  {weekday(h.date)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {extra > 0 && canManage && (
          <button
            onClick={() => setManaging(true)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            + {extra} more
          </button>
        )}
        {extra > 0 && !canManage && (
          <p className="mt-2 text-xs text-gray-400">+ {extra} more ahead</p>
        )}
      </div>

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        body: JSON.stringify({ name, date }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Could not add that");
      setRows((prev) => [...prev, d].sort((a, b) => a.date.localeCompare(b.date)));
      setName("");
      setDate("");
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
    <Modal open={open} onClose={onClose} title={`Holidays ${year}`} width="max-w-md">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali"
            aria-label="Holiday name"
            maxLength={80}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={add}
            disabled={busy || !name.trim() || !date}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
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
            {rows.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2">
                <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 tabular-nums w-[4.5rem] flex-shrink-0">
                  {dayLabel(h.date)}
                </span>
                <span className="text-sm text-gray-700 dark:text-slate-300 min-w-0 truncate">{h.name}</span>
                <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">{weekday(h.date)}</span>
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

/** Which weekday it lands on — the first thing anybody wants to know. */
function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}
