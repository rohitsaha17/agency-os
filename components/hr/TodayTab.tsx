"use client";

/**
 * Today — what needs attention, not an analytics dashboard.
 *
 * The board used to be three grouped card decks, which answered "who is in"
 * and nothing else. The question an owner actually opens this with is
 * narrower and more useful: what is waiting for ME. So the same data is laid
 * out as one scannable table with a column of things to act on beside it —
 * who hasn't checked in, whose leave is waiting on a decision, and who is off
 * later this week.
 *
 * Three things it refuses to say.
 *
 * Nobody is "absent". Not checked in at half past nine is somebody on a
 * train, and a board that calls that absence is confidently wrong.
 *
 * Nobody is "late". Nothing in this product records an expected start time,
 * so lateness would be a judgement the software invented and then attributed
 * to a person's timekeeping. The mockup asks for the column; the data cannot
 * honestly fill it.
 *
 * Workload is only shown to somebody who plans work — the same rule the
 * assignee picker has always applied to it. Everyone else gets no column
 * rather than a column of zeroes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Plane, ShieldCheck, Inbox, CalendarClock } from "lucide-react";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { fullDay, clockTime, dateRange, matchesQuery } from "@/lib/people";
import {
  PersonCell, PersonAvatar, StatusBadge, SummaryCard, SummaryStrip,
  Table, Th, Td, Row, RowMenu, EmptyState, TableSkeleton, CardsSkeleton, MobileCard,
  type Tone,
} from "@/components/people/kit";

type State = "IN" | "ON_LEAVE" | "UNKNOWN";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
  state: State;
  checkedInAt: string | null;
  recordedByAdmin: boolean;
  note: string | null;
  leaveKind: "PAID" | "UNPAID" | null;
  openToday: number | null;
}

interface LeaveBrief {
  id: string;
  start: string;
  end: string;
  kind?: "PAID" | "UNPAID" | null;
  user: { id: string; name: string; avatarUrl: string | null };
}

interface Feed {
  date: string;
  seesTeam: boolean;
  seesLoad: boolean;
  people: Person[];
  pending: LeaveBrief[];
  upcoming: LeaveBrief[];
  summary: { in: number; onLeave: number; unknown: number };
}

const STATE: Record<State, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  IN: { label: "Present", tone: "green", icon: CheckCircle2 },
  ON_LEAVE: { label: "On leave", tone: "blue", icon: Plane },
  UNKNOWN: { label: "Not checked in", tone: "grey", icon: CircleDashed },
};

export function TodayTab({
  query, canManage, onNavigate,
}: {
  query: string;
  canManage: boolean;
  onNavigate: (tab: "attendance" | "leave", userId?: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<State | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hr/today");
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "The team board isn't part of your access."
          : "Something went wrong loading today's board.");
      }
      setFeed(await res.json());
    } catch (e) {
      setFeed(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!feed) return [];
    return feed.people.filter((p) => matchesQuery(p, query) && (!filter || p.state === filter));
  }, [feed, query, filter]);

  async function markPresent(p: Person) {
    const ok = await confirm({
      title: `Mark ${p.name.split(" ")[0]} present?`,
      message: "This records them as in today. It will show as entered by an admin, not as them checking in.",
      confirmLabel: "Mark present",
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.id }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Couldn't record that");
      toast.success(`${p.name.split(" ")[0]} marked present`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <LoadError
        message="Couldn't load today's board"
        detail={error}
        onRetry={load}
      />
    );
  }

  if (!feed) {
    return (
      <div className="space-y-3">
        <CardsSkeleton />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  const total = feed.people.length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : undefined);
  const attention = feed.people.filter((p) => p.state === "UNKNOWN");

  return (
    <div className="space-y-3">
      <SummaryStrip>
        <SummaryCard label="Team members" value={total} />
        <SummaryCard
          label="Present today" value={feed.summary.in} hint={pct(feed.summary.in)}
          tone="green" active={filter === "IN"}
          onClick={() => setFilter((f) => (f === "IN" ? "" : "IN"))}
        />
        <SummaryCard
          label="Not checked in" value={feed.summary.unknown} hint={pct(feed.summary.unknown)}
          tone="grey" active={filter === "UNKNOWN"}
          onClick={() => setFilter((f) => (f === "UNKNOWN" ? "" : "UNKNOWN"))}
        />
        <SummaryCard
          label="On leave" value={feed.summary.onLeave} hint={pct(feed.summary.onLeave)}
          tone="blue" active={filter === "ON_LEAVE"}
          onClick={() => setFilter((f) => (f === "ON_LEAVE" ? "" : "ON_LEAVE"))}
        />
      </SummaryStrip>

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem] items-start">
        <div className="min-w-0 space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Today · <span className="text-gray-700 dark:text-slate-200">{fullDay(feed.date)}</span>
          </h2>

          {rows.length === 0 ? (
            <EmptyState
              title={query || filter ? "Nobody matches that" : "Nobody on the team yet"}
              hint={
                query || filter
                  ? "Clear the search or the filter to see everyone."
                  : "People added under Staff appear here each day."
              }
            />
          ) : (
            <>
              {/* Desktop: one scannable table. */}
              <div className="hidden sm:block">
                <Table minWidth={feed.seesLoad ? 680 : 580}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                      <Th>Check-in</Th>
                      {feed.seesLoad && <Th align="right">Due today</Th>}
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const s = STATE[p.state];
                      return (
                        <Row key={p.id}>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              <PersonCell name={p.name} url={p.avatarUrl} />
                              {p.recordedByAdmin && (
                                <span title="Recorded by an admin, not a self check-in">
                                  <ShieldCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                </span>
                              )}
                            </div>
                          </Td>
                          <Td className="text-gray-600 dark:text-slate-300">{p.craft ?? "—"}</Td>
                          <Td>
                            <StatusBadge tone={s.tone} icon={<s.icon className="w-3 h-3" aria-hidden />}>
                              {p.state === "ON_LEAVE" && p.leaveKind
                                ? p.leaveKind === "UNPAID" ? "Unpaid leave" : "Paid leave"
                                : s.label}
                            </StatusBadge>
                          </Td>
                          <Td nowrap className="text-gray-600 dark:text-slate-300">
                            {p.state === "IN" ? clockTime(p.checkedInAt) : "—"}
                          </Td>
                          {feed.seesLoad && (
                            <Td align="right" className="text-gray-600 dark:text-slate-300">
                              {p.openToday ? `${p.openToday} task${p.openToday === 1 ? "" : "s"}` : "—"}
                            </Td>
                          )}
                          <Td align="right">
                            <RowMenu
                              label={`Actions for ${p.name}`}
                              items={[
                                {
                                  label: busy === p.id ? "Recording…" : "Mark present",
                                  onSelect: () => markPresent(p),
                                  disabled: !canManage || p.state !== "UNKNOWN",
                                },
                                { label: "See their month", onSelect: () => onNavigate("attendance", p.id) },
                                { label: "See their leave", onSelect: () => onNavigate("leave", p.id) },
                              ]}
                            />
                          </Td>
                        </Row>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Phone: the same rows as cards, because six columns on 375px
                  is a horizontal scroll nobody performs. */}
              <div className="sm:hidden space-y-1.5">
                {rows.map((p) => {
                  const s = STATE[p.state];
                  return (
                    <MobileCard key={p.id}>
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={p.name} url={p.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                            {p.craft ?? "—"}
                            {p.state === "IN" && p.checkedInAt ? ` · ${clockTime(p.checkedInAt)}` : ""}
                            {feed.seesLoad && p.openToday ? ` · ${p.openToday} due` : ""}
                          </p>
                        </div>
                        <StatusBadge tone={s.tone} icon={<s.icon className="w-3 h-3" aria-hidden />}>
                          {s.label}
                        </StatusBadge>
                      </div>
                    </MobileCard>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* The column of things to do something about. */}
        <aside className="space-y-3 lg:sticky lg:top-2">
          <Panel
            title="Needs attention"
            icon={<Inbox className="w-3.5 h-3.5" />}
            count={attention.length + feed.pending.length}
          >
            {attention.length === 0 && feed.pending.length === 0 ? (
              <p className="text-[12px] text-gray-400 px-3 py-4 text-center">
                Nothing waiting. Everybody is accounted for.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {feed.pending.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate("leave", r.user.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                    >
                      <PersonAvatar name={r.user.name} url={r.user.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">
                          {r.user.name}
                        </p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
                          Leave waiting · {dateRange(r.start, r.end)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
                {attention.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                    <PersonAvatar name={p.name} url={p.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">Not checked in yet</p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => markPresent(p)}
                        disabled={busy === p.id}
                        className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 flex-shrink-0"
                      >
                        Mark in
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Upcoming this week"
            icon={<CalendarClock className="w-3.5 h-3.5" />}
            count={feed.upcoming.length}
          >
            {feed.upcoming.length === 0 ? (
              <p className="text-[12px] text-gray-400 px-3 py-4 text-center">
                Nobody is booked off in the next seven days.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {feed.upcoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 px-3 py-2">
                    <PersonAvatar name={r.user.name} url={r.user.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">
                        {r.user.name}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                        On leave · {dateRange(r.start, r.end)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title, icon, count, children,
}: {
  title: string; icon: React.ReactNode; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 overflow-hidden">
      <header className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
          {title}
        </h3>
        {!!count && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 tabular-nums">
            {count}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
