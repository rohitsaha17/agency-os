"use client";

/**
 * The month, as a grid — people down the side, days across the top.
 *
 * This is the month-end review screen: one look tells you who was in and how
 * often, without opening anybody's record.
 *
 * Three things it deliberately does NOT do.
 *
 * It doesn't call a blank future day absent. Days after today are drawn as
 * nothing at all, because "Priya was absent on the 30th" is a claim about
 * something that hasn't happened.
 *
 * It doesn't decide which days are working days. The app has no concept of a
 * roster or a holiday calendar, and a creative agency shoots on weekends —
 * so Saturday and Sunday get a faint tint to help the eye track weeks, and
 * are otherwise counted like any other day. Inventing a five-day week here
 * would put a wrong denominator under every total.
 *
 * And it doesn't total "absences". It totals days present and days on leave,
 * which are facts. Whether twelve days in a month is a problem is a judgement
 * for the person reading it, and dressing it up as a number the software
 * computed would only make that judgement look automatic.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Avatar } from "@/components/hr/TodayTab";

interface Person { id: string; name: string; avatarUrl: string | null; craft: string | null }
interface Day { id: string; userId: string; date: string; checkedInAt: string; note: string | null; source: "SELF" | "ADMIN" }
interface Leave { userId: string; start: string; end: string; kind: "PAID" | "UNPAID" | null }

type Cell =
  | { state: "IN"; day: Day }
  | { state: "LEAVE"; kind: "PAID" | "UNPAID" | null }
  | { state: "EMPTY" }
  | { state: "FUTURE" };

/** Width of each pinned total column. Must equal the w-14 on those cells. */
const TOTAL_W = "3.5rem";

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every day in the month, as YYYY-MM-DD, with its weekday. */
function daysOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const out: { key: string; dom: number; dow: number }[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    out.push({ key: date.toISOString().slice(0, 10), dom: d, dow: date.getUTCDay() });
  }
  return out;
}

export function AttendanceTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<{ people: Person[]; days: Day[]; leave: Leave[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/hr/attendance?scope=team&month=${month}`);
      if (!res.ok) throw new Error(res.status === 403 ? "The team's attendance isn't part of your access." : `The server returned ${res.status}.`);
      const d = await res.json();
      setData({ people: d.people ?? [], days: d.days ?? [], leave: d.leave ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const cols = useMemo(() => daysOf(month), [month]);

  const grid = useMemo(() => {
    if (!data) return null;
    const byUserDay = new Map<string, Day>();
    for (const d of data.days) byUserDay.set(`${d.userId}|${d.date}`, d);

    const cell = (userId: string, key: string): Cell => {
      const day = byUserDay.get(`${userId}|${key}`);
      if (day) return { state: "IN", day };
      const l = data.leave.find((x) => x.userId === userId && key >= x.start && key <= x.end);
      if (l) return { state: "LEAVE", kind: l.kind };
      // A day that hasn't happened is not an absence.
      if (key > today) return { state: "FUTURE" };
      return { state: "EMPTY" };
    };

    return data.people.map((p) => {
      const cells = cols.map((c) => ({ ...c, cell: cell(p.id, c.key) }));
      return {
        person: p,
        cells,
        present: cells.filter((c) => c.cell.state === "IN").length,
        onLeave: cells.filter((c) => c.cell.state === "LEAVE").length,
      };
    });
  }, [data, cols, today]);

  const toggle = async (personId: string, key: string, existing: Day | null) => {
    if (!canEdit) return;
    const id = `${personId}|${key}`;
    if (existing) {
      const ok = await confirm({
        title: "Remove this day?",
        message: `${key} will no longer show as present. This is a record other people rely on.`,
        confirmLabel: "Remove",
        variant: "danger",
      });
      if (!ok) return;
      setBusyCell(id);
      try {
        const res = await fetch(`/api/hr/attendance?id=${existing.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        load();
      } catch { toast.error("Couldn't remove that"); } finally { setBusyCell(null); }
      return;
    }
    setBusyCell(id);
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: personId, date: key }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't add that");
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that");
    } finally { setBusyCell(null); }
  };

  const exportCsv = () => {
    if (!grid) return;
    const head = ["Name", "Role", ...cols.map((c) => String(c.dom)), "Days present", "Days on leave"];
    const body = grid.map((r) => [
      r.person.name, r.person.craft ?? "",
      ...r.cells.map((c) =>
        c.cell.state === "IN" ? "P"
          : c.cell.state === "LEAVE" ? (c.cell.kind === "UNPAID" ? "U" : "L")
            : c.cell.state === "FUTURE" ? "" : "-"),
      r.present, r.onLeave,
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => {
        const s = String(c ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <LoadError message="Couldn't load the month" detail={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <Button size="sm" variant="secondary" icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!grid?.length}>
          Export
        </Button>
        <Legend canEdit={canEdit} />
      </div>

      {!grid ? (
        <div className="h-64 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
      ) : grid.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">Nobody on the team yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 border border-gray-200 dark:border-white/[0.08] rounded-xl">
          <table className="border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 bg-gray-50 dark:bg-slate-900 text-left font-medium text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 px-3 py-2 border-b border-r border-gray-200 dark:border-white/[0.08] min-w-[160px]">
                  Name
                </th>
                {cols.map((c) => (
                  <th key={c.key} className={`w-7 px-0 pt-1.5 text-center text-[9px] font-medium uppercase ${headTone(c, today)}`}>
                    {"SMTWTFS"[c.dow]}
                  </th>
                ))}
                {/* Pinned to the right edge: these counts are the reason this
                    screen exists, and a 31-column scroll had been hiding them
                    behind the calendar. Fixed widths so the two sticky offsets
                    are exact — TOTAL_W has to match w-14 or the columns drift
                    apart as the table scrolls. */}
                <th rowSpan={2} style={{ right: TOTAL_W }}
                  className="sticky z-20 w-14 bg-gray-50 dark:bg-slate-900 px-2 py-2 text-center font-medium text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-l border-gray-200 dark:border-white/[0.08] whitespace-nowrap">
                  In
                </th>
                <th rowSpan={2}
                  className="sticky right-0 z-20 w-14 bg-gray-50 dark:bg-slate-900 px-2 py-2 text-center font-medium text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-white/[0.08] whitespace-nowrap">
                  Leave
                </th>
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={`w-7 px-0 pb-1.5 text-center font-medium tabular-nums border-b border-gray-200 dark:border-white/[0.08] ${headTone(c, today)}`}>
                    {c.dom}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((r) => (
                <tr key={r.person.id}>
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-1.5 border-b border-r border-gray-100 dark:border-white/[0.05]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={r.person.name} url={r.person.avatarUrl} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-slate-100 truncate">{r.person.name}</p>
                        {r.person.craft && <p className="text-[10px] text-gray-500 dark:text-slate-400 truncate">{r.person.craft}</p>}
                      </div>
                    </div>
                  </td>
                  {r.cells.map((c) => (
                    <CellBox key={c.key} c={c} today={today} canEdit={canEdit}
                      busy={busyCell === `${r.person.id}|${c.key}`}
                      onToggle={() => toggle(r.person.id, c.key, c.cell.state === "IN" ? c.cell.day : null)}
                      who={r.person.name} />
                  ))}
                  <td style={{ right: TOTAL_W }}
                    className="sticky z-10 w-14 bg-white dark:bg-slate-900 px-2 py-1.5 text-center tabular-nums font-semibold text-gray-900 dark:text-slate-100 border-b border-l border-gray-100 dark:border-white/[0.05]">
                    {r.present}
                  </td>
                  <td className="sticky right-0 z-10 w-14 bg-white dark:bg-slate-900 px-2 py-1.5 text-center tabular-nums text-sky-600 dark:text-sky-400 border-b border-gray-100 dark:border-white/[0.05]">
                    {r.onLeave || <span className="text-gray-300 dark:text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Today wins over the weekend tint; both beat a plain weekday. */
function headTone(c: { key: string; dow: number }, today: string) {
  if (c.key === today) return "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (c.dow === 0 || c.dow === 6) return "bg-gray-50 dark:bg-white/[0.03] text-gray-400";
  return "text-gray-500 dark:text-slate-400";
}

function CellBox({ c, today, canEdit, busy, onToggle, who }: {
  c: { key: string; dom: number; dow: number; cell: Cell };
  today: string; canEdit: boolean; busy: boolean; onToggle: () => void; who: string;
}) {
  const { cell } = c;
  const weekend = c.dow === 0 || c.dow === 6;
  const isToday = c.key === today;

  const fill =
    cell.state === "IN" ? "bg-emerald-500"
      : cell.state === "LEAVE" ? (cell.kind === "UNPAID" ? "bg-sky-300 dark:bg-sky-600" : "bg-sky-500")
        : "";

  const title =
    cell.state === "IN"
      ? `${who} — in on ${c.key}${cell.day.source === "ADMIN" ? " (recorded by an admin)" : ""}`
      : cell.state === "LEAVE"
        ? `${who} — ${cell.kind === "UNPAID" ? "unpaid" : "paid"} leave on ${c.key}`
        : cell.state === "FUTURE"
          ? `${c.key} hasn't happened yet`
          : `${who} — no record for ${c.key}`;

  // Only a past-or-today blank is worth offering to fill in, and only to
  // somebody who may. A future day has nothing to record.
  const clickable = canEdit && cell.state !== "FUTURE" && cell.state !== "LEAVE";

  return (
    <td className={`w-7 h-7 p-0 text-center border-b border-gray-100 dark:border-white/[0.05] ${
      isToday ? "bg-indigo-50/60 dark:bg-indigo-500/10" : weekend ? "bg-gray-50/70 dark:bg-white/[0.03]" : ""
    }`}>
      {clickable ? (
        <button type="button" onClick={onToggle} title={title} disabled={busy}
          aria-label={title}
          className="group w-7 h-7 flex items-center justify-center disabled:opacity-40">
          <Mark state={cell.state} fill={fill} interactive />
        </button>
      ) : (
        <span title={title} className="w-7 h-7 flex items-center justify-center">
          <Mark state={cell.state} fill={fill} />
        </span>
      )}
    </td>
  );
}

function Mark({ state, fill, interactive }: { state: Cell["state"]; fill: string; interactive?: boolean }) {
  if (state === "FUTURE") return <span className="w-1 h-1 rounded-full bg-gray-200 dark:bg-slate-700" />;
  if (state === "EMPTY") {
    return interactive ? (
      <>
        <span className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 group-hover:hidden" />
        <Plus className="w-3 h-3 text-gray-400 hidden group-hover:block" />
      </>
    ) : (
      <span className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700" />
    );
  }
  return (
    <>
      <span className={`w-3.5 h-3.5 rounded-[4px] ${fill} ${interactive ? "group-hover:hidden" : ""}`} />
      {interactive && <X className="w-3 h-3 text-gray-500 hidden group-hover:block" />}
    </>
  );
}

function Legend({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-[3px] bg-emerald-500" /> in</span>
      <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-[3px] bg-sky-500" /> paid leave</span>
      <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-[3px] bg-sky-300 dark:bg-sky-600" /> unpaid</span>
      <span className="inline-flex items-center gap-1"><i className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600" /> no record</span>
      {canEdit && <span className="text-gray-400">· click a day to add or remove</span>}
    </div>
  );
}
