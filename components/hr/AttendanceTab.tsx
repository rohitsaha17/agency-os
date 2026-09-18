"use client";

/**
 * The month, as a grid — people down the side, days across the top.
 *
 * This is the month-end review screen: one look tells you who was in and how
 * often, without opening anybody's record. Clicking a name opens that
 * person's month beside it; clicking a cell still toggles the day for an
 * admin, which is how a month gets corrected quickly and is deliberately
 * unchanged.
 *
 * Four things it will not do, all for the same reason — it should not state
 * things the data does not know.
 *
 * It doesn't call a blank future day absent. Days after today are drawn as
 * nothing at all, because "Priya was absent on the 30th" is a claim about
 * something that hasn't happened.
 *
 * It doesn't say anybody was LATE. Nothing here records an expected start
 * time, so lateness would be invented and then attributed to a person.
 *
 * It doesn't decide which days are working days. The app has no roster and no
 * holiday calendar, and a creative agency shoots at weekends — so Saturday
 * and Sunday get a faint tint to help the eye track weeks and are otherwise
 * counted like any other day.
 *
 * And the attendance rate divides by days that have HAPPENED, minus approved
 * leave. Dividing by the whole month tells everybody they are at 60% on the
 * 18th; counting granted leave against them turns an approval into a mark.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Percent } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Drawer, DrawerLine, DrawerSection } from "@/components/people/Drawer";
import {
  PersonAvatar, PersonCell, SummaryCard, SummaryStrip,
  MonthStepper, ClearFilters, EmptyState, TableSkeleton, CardsSkeleton, MobileCard,
} from "@/components/people/kit";
import {
  ATTENDANCE_LABEL, attendanceRate, attendanceState, clockTime, leaveOn,
  longDate, matchesQuery, monthDays, shortDate,
  type AttendanceState, type LeaveSpan,
} from "@/lib/people";

interface Person { id: string; name: string; avatarUrl: string | null; craft: string | null }
interface Day {
  id: string; userId: string; date: string; checkedInAt: string;
  note: string | null; source: "SELF" | "ADMIN";
}
interface Leave extends LeaveSpan { userId: string }

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Cell fill per state. Faint: thirty columns of saturated colour is unreadable. */
const CELL: Record<AttendanceState, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  LEAVE: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  NO_RECORD: "bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-slate-500",
  FUTURE: "",
};

/** A letter as well as a colour, so the grid survives greyscale. */
const GLYPH: Record<AttendanceState, string> = {
  PRESENT: "P", LEAVE: "L", NO_RECORD: "·", FUTURE: "",
};

export function AttendanceTab({
  canEdit, query, focusUserId, onFocusHandled,
}: {
  canEdit: boolean;
  query: string;
  /** Somebody arrived here from another tab wanting one person's month. */
  focusUserId?: string | null;
  onFocusHandled?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<{ people: Person[]; days: Day[]; leave: Leave[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [craft, setCraft] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/hr/attendance?scope=team&month=${month}`);
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "The team's attendance isn't part of your access."
          : "Something went wrong loading this month's attendance.");
      }
      const d = await res.json();
      setData({ people: d.people ?? [], days: d.days ?? [], leave: d.leave ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Arriving from Today's "see their month".
  useEffect(() => {
    if (focusUserId) { setOpen(focusUserId); onFocusHandled?.(); }
  }, [focusUserId, onFocusHandled]);

  const today = new Date().toISOString().slice(0, 10);
  const cols = useMemo(() => monthDays(month), [month]);

  const crafts = useMemo(
    () => [...new Set((data?.people ?? []).map((p) => p.craft).filter(Boolean) as string[])].sort(),
    [data],
  );

  const grid = useMemo(() => {
    if (!data) return null;
    const byUserDay = new Map<string, Day>();
    for (const d of data.days) byUserDay.set(`${d.userId}|${d.date}`, d);
    const leaveByUser = new Map<string, Leave[]>();
    for (const l of data.leave) {
      if (!leaveByUser.has(l.userId)) leaveByUser.set(l.userId, []);
      leaveByUser.get(l.userId)!.push(l);
    }

    return data.people
      .filter((p) => matchesQuery(p, query) && (!craft || p.craft === craft))
      .map((p) => {
        const spans = leaveByUser.get(p.id) ?? [];
        const cells = cols.map((c) => ({
          ...c,
          day: byUserDay.get(`${p.id}|${c.key}`),
          leave: leaveOn(spans, c.key),
          state: attendanceState(byUserDay.get(`${p.id}|${c.key}`), leaveOn(spans, c.key), c.key, today),
        }));
        const present = cells.filter((c) => c.state === "PRESENT").length;
        const leave = cells.filter((c) => c.state === "LEAVE").length;
        const noRecord = cells.filter((c) => c.state === "NO_RECORD").length;
        return {
          person: p, cells, present, leave, noRecord,
          rate: attendanceRate({ present, leave, noRecord }),
        };
      });
  }, [data, cols, today, query, craft]);

  const totals = useMemo(() => {
    if (!grid) return null;
    const present = grid.reduce((s, r) => s + r.present, 0);
    const leave = grid.reduce((s, r) => s + r.leave, 0);
    const noRecord = grid.reduce((s, r) => s + r.noRecord, 0);
    return { present, leave, noRecord, rate: attendanceRate({ present, leave, noRecord }) };
  }, [grid]);

  const toggle = async (personId: string, key: string, existing: Day | null) => {
    if (!canEdit) return;
    const id = `${personId}|${key}`;
    if (existing) {
      const ok = await confirm({
        title: "Remove this day?",
        message: `${longDate(key)} will no longer show as present. This is a record other people rely on.`,
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
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Couldn't record that");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that");
    } finally { setBusyCell(null); }
  };

  const exportCsv = () => {
    if (!grid) return;
    const head = ["Name", "Role", ...cols.map((c) => String(c.dom)), "Present", "On leave", "No record", "Rate %"];
    const body = grid.map((r) => [
      r.person.name, r.person.craft ?? "",
      ...r.cells.map((c) => (c.state === "FUTURE" ? "" : GLYPH[c.state])),
      r.present, r.leave, r.noRecord, r.rate ?? "",
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

  const opened = grid?.find((r) => r.person.id === open) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper month={month} onChange={setMonth} />
        <Select
          value={craft} onChange={setCraft} allowEmpty placeholder="All roles" size="sm"
          options={crafts.map((c) => ({ value: c, label: c }))}
          className="min-w-[8.5rem]"
        />
        {craft && <ClearFilters onClear={() => setCraft("")} />}
        <Button
          size="sm" variant="secondary" className="ml-auto"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!grid?.length}
        >
          Export
        </Button>
      </div>

      {error ? (
        <LoadError message="Couldn't load attendance" detail={error} onRetry={load} />
      ) : !grid || !totals ? (
        <div className="space-y-3"><CardsSkeleton /><TableSkeleton rows={6} /></div>
      ) : (
        <>
          <SummaryStrip>
            <SummaryCard label="Days present" value={totals.present} tone="green" />
            <SummaryCard label="Days on leave" value={totals.leave} tone="blue" />
            <SummaryCard
              label="Days with no record" value={totals.noRecord} tone="grey"
              title="Past days where nobody checked in and no leave was approved"
            />
            <SummaryCard
              label="Attendance rate"
              value={totals.rate == null ? "—" : `${totals.rate}%`}
              title="Days present out of days that have happened, excluding approved leave"
            />
          </SummaryStrip>

          {grid.length === 0 ? (
            <EmptyState
              title={query || craft ? "Nobody matches that" : "Nobody on the team yet"}
              hint={query || craft ? "Clear the search or the role filter." : "People added under Staff appear here."}
            />
          ) : (
            <>
            {/* Phones get the month as a list, not a thirty-column scroll.
                Sideways-scrolling a matrix on 375px is a motion nobody
                performs; the totals are what the month-end review is for, and
                the day-by-day detail is one tap away in the drawer. */}
            <ul className="sm:hidden space-y-1.5">
              {grid.map((r) => (
                <li key={r.person.id}>
                  <MobileCard onOpen={() => setOpen(r.person.id)} label={`Open ${r.person.name}'s month`}>
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar name={r.person.name} url={r.person.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">
                          {r.person.name}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          {r.present} present
                          {r.leave > 0 && ` · ${r.leave} on leave`}
                          {r.noRecord > 0 && ` · ${r.noRecord} no record`}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-slate-100 flex-shrink-0">
                        {r.rate == null ? "—" : `${r.rate}%`}
                      </span>
                    </div>
                  </MobileCard>
                </li>
              ))}
            </ul>

            <div className="hidden sm:block overflow-auto border rounded-xl border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 max-h-[calc(100dvh-22rem)] min-h-[16rem]">
              <table className="border-separate border-spacing-0 text-[12px] w-max">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-40 bg-gray-50 dark:bg-slate-900 text-left font-semibold text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 px-3 py-2 border-b border-r border-gray-200 dark:border-white/[0.08] min-w-[180px] w-[180px]"
                    >
                      Name
                    </th>
                    {cols.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={`sticky top-0 z-30 w-7 px-0 py-1 text-center font-medium border-b border-gray-200 dark:border-white/[0.08] ${headTone(c, today)}`}
                      >
                        <span className="block text-[8px] uppercase">{"SMTWTFS"[c.dow]}</span>
                        <span className="block text-[11px] font-semibold tabular-nums">{c.dom}</span>
                      </th>
                    ))}
                    {/* Pinned right: these totals are why the screen exists, and
                        a 31-column scroll was hiding them behind the calendar. */}
                    <th style={{ right: "3.25rem" }} className={STICKY_TOTAL_HEAD}>In</th>
                    <th className={`${STICKY_TOTAL_HEAD} right-0`}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((r) => (
                    <tr key={r.person.id} className="group/row">
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 p-0 text-left font-normal border-b border-r border-gray-100 dark:border-white/[0.06] ${
                          open === r.person.id
                            ? "bg-indigo-50 dark:bg-indigo-500/10"
                            : "bg-white dark:bg-slate-900 group-hover/row:bg-gray-50 dark:group-hover/row:bg-white/[0.04]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpen(r.person.id)}
                          aria-label={`Open ${r.person.name}'s month`}
                          className="w-[180px] px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                        >
                          <PersonCell name={r.person.name} url={r.person.avatarUrl} secondary={r.person.craft} size="sm" />
                        </button>
                      </th>
                      {r.cells.map((c) => (
                        <Cell
                          key={c.key}
                          state={c.state}
                          dom={c.dom}
                          dow={c.dow}
                          who={r.person.name}
                          dateKey={c.key}
                          checkedInAt={c.day?.checkedInAt ?? null}
                          canEdit={canEdit}
                          busy={busyCell === `${r.person.id}|${c.key}`}
                          onToggle={() => toggle(r.person.id, c.key, c.day ?? null)}
                        />
                      ))}
                      <td style={{ right: "3.25rem" }} className={STICKY_TOTAL_CELL}>
                        {r.present}
                      </td>
                      <td className={`${STICKY_TOTAL_CELL} right-0`}>
                        {r.rate == null ? <span className="text-gray-300 dark:text-slate-600">—</span> : `${r.rate}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          <div className="hidden sm:block"><Legend canEdit={canEdit} /></div>
        </>
      )}

      {opened && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={opened.person.name}
          subtitle={opened.person.craft ?? "Team"}
          label={`${opened.person.name}'s attendance`}
          headerAside={<PersonAvatar name={opened.person.name} url={opened.person.avatarUrl} size="lg" />}
        >
          <DrawerSection title={`This month · ${month}`}>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine label="Days present" value={opened.present} tone="strong" />
              <DrawerLine label="Days on leave" value={opened.leave} />
              <DrawerLine label="Days with no record" value={opened.noRecord} />
              <DrawerLine
                label="Attendance rate"
                value={opened.rate == null ? "—" : `${opened.rate}%`}
                tone="strong"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Out of days that have happened. Approved leave is left out rather than
              counted against them.
            </p>
          </DrawerSection>

          <DrawerSection title="Recent activity">
            {(() => {
              // Newest first, and only days that actually say something.
              const notable = [...opened.cells]
                .filter((c) => c.state === "PRESENT" || c.state === "LEAVE")
                .reverse()
                .slice(0, 12);
              if (notable.length === 0) {
                return <p className="text-[12px] text-gray-400">Nothing recorded this month.</p>;
              }
              return (
                <ul className="space-y-1">
                  {notable.map((c) => (
                    <li
                      key={c.key}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/[0.08] px-2.5 py-1.5"
                    >
                      <span className="text-[11px] text-gray-500 dark:text-slate-400 w-[4.5rem] flex-shrink-0">
                        {shortDate(c.key)}
                      </span>
                      {c.state === "PRESENT" ? (
                        <span className="text-[12px] text-gray-800 dark:text-slate-200">
                          Checked in at {clockTime(c.day?.checkedInAt ?? null)}
                          {c.day?.source === "ADMIN" && (
                            <span className="text-gray-400"> · entered by an admin</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[12px] text-sky-700 dark:text-sky-300">
                          On {c.leave?.kind === "UNPAID" ? "unpaid" : "approved"} leave
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </DrawerSection>
        </Drawer>
      )}
    </div>
  );
}

const STICKY_TOTAL_HEAD =
  "sticky z-40 w-[3.25rem] bg-gray-50 dark:bg-slate-900 px-2 py-2 text-center font-semibold text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-l border-gray-200 dark:border-white/[0.08] whitespace-nowrap top-0";

const STICKY_TOTAL_CELL =
  "sticky z-10 w-[3.25rem] bg-white dark:bg-slate-900 group-hover/row:bg-gray-50 dark:group-hover/row:bg-white/[0.04] px-2 py-1.5 text-center tabular-nums text-[11px] font-semibold text-gray-900 dark:text-slate-100 border-b border-l border-gray-100 dark:border-white/[0.06]";

/** Today wins over the weekend tint; both beat a plain weekday. */
function headTone(c: { key: string; dow: number }, today: string) {
  if (c.key === today) return "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (c.dow === 0 || c.dow === 6) return "bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-slate-500";
  return "bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400";
}

function Cell({
  state, dom, dow, who, dateKey, checkedInAt, canEdit, busy, onToggle,
}: {
  state: AttendanceState; dom: number; dow: number; who: string; dateKey: string;
  checkedInAt: string | null; canEdit: boolean; busy: boolean; onToggle: () => void;
}) {
  const weekend = dow === 0 || dow === 6;
  const title = `${who}, ${longDate(dateKey)} — ${ATTENDANCE_LABEL[state]}${
    state === "PRESENT" && checkedInAt ? ` at ${clockTime(checkedInAt)}` : ""
  }`;

  const body = (
    <span
      className={`flex items-center justify-center w-5 h-5 mx-auto rounded text-[9px] font-bold ${CELL[state]} ${
        busy ? "animate-pulse" : ""
      }`}
      aria-hidden
    >
      {GLYPH[state]}
    </span>
  );

  return (
    <td
      className={`w-7 px-0 py-1 text-center border-b border-gray-100 dark:border-white/[0.06] group-hover/row:bg-gray-50 dark:group-hover/row:bg-white/[0.04] ${
        weekend ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""
      }`}
    >
      {canEdit && state !== "FUTURE" && state !== "LEAVE" ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          // Opts out of the 44px touch minimum in globals.css. Stretching a
          // day to 44px does not make the month easier to tap, it makes it
          // half again as wide; the grid is hidden on phones anyway and this
          // stops a tablet inheriting the problem.
          data-fixed-size
          title={`${title} — click to ${state === "PRESENT" ? "remove" : "mark present"}`}
          aria-label={`${title}. Click to ${state === "PRESENT" ? "remove" : "mark present"}.`}
          className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 rounded"
        >
          {body}
        </button>
      ) : (
        <span title={title} aria-label={title} role="img">
          {body}
        </span>
      )}
    </td>
  );
}

function Legend({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
      <Key tone={CELL.PRESENT} glyph="P" label="Present" />
      <Key tone={CELL.LEAVE} glyph="L" label="Approved leave" />
      <Key tone={CELL.NO_RECORD} glyph="·" label="No record" />
      <span className="inline-flex items-center gap-1">
        <Percent className="w-3 h-3 text-gray-400" aria-hidden />
        Rate excludes approved leave and days still to come
      </span>
      {canEdit && <span className="text-gray-400">Click a day to add or remove it</span>}
    </div>
  );
}

function Key({ tone, glyph, label }: { tone: string; glyph: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold ${tone}`} aria-hidden>
        {glyph}
      </span>
      {label}
    </span>
  );
}
