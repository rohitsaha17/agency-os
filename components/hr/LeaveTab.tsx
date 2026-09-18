"use client";

/**
 * Leave — asking for it, and deciding it.
 *
 * One component for both sides, because they are the same list seen from two
 * chairs. An approver gets everybody's, with the requests waiting on them at
 * the top where they can be dealt with; everyone else gets their own and a
 * form.
 *
 * Approving forces a choice of paid or unpaid. There is no default and the
 * approve button stays disabled until one is picked — an approval with no kind
 * is a decision that has not been made, and it is the payroll sheet that would
 * have to answer for it later. Declining needs no kind, so it is one press.
 *
 * Approval is also the moment leave becomes real: the server writes the days
 * into the availability table, which is what stops anybody being assigned a
 * shoot on them. Revoking takes those days back out. Neither of those rules
 * lives here — this screen only makes them easy to reach.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Check, X, CalendarDays } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Drawer, DrawerLine, DrawerSection } from "@/components/people/Drawer";
import {
  PersonAvatar, PersonCell, StatusBadge, SummaryCard, SummaryStrip,
  MonthStepper, Table, Th, Td, Row, RowMenu, EmptyState, TableSkeleton,
  CardsSkeleton, MobileCard, ClearFilters, type Tone,
} from "@/components/people/kit";
import { MIN_LEAVE_REASON, MAX_LEAVE_REASON } from "@/lib/hr";
import {
  dateRange, longDate, matchesQuery, monthDays, monthName, shortDate,
} from "@/lib/people";

interface Req {
  id: string; userId: string; start: string; end: string; days: number;
  reason: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  kind: "PAID" | "UNPAID" | null; decisionNote: string | null; createdAt: string;
  decidedAt: string | null;
  user: { id: string; name: string; avatarUrl: string | null };
  decidedBy: { id: string; name: string } | null;
}

const STATUS_TONE: Record<Req["status"], Tone> = {
  PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "grey",
};
const STATUS_LABEL: Record<Req["status"], string> = {
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Declined", CANCELLED: "Cancelled",
};

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Does a request touch this month at all? */
function inMonth(r: Req, month: string): boolean {
  return r.start.slice(0, 7) <= month && r.end.slice(0, 7) >= month;
}

export function LeaveTab({
  canDecide, query, focusUserId, onFocusHandled,
}: {
  canDecide: boolean;
  query: string;
  focusUserId?: string | null;
  onFocusHandled?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<Req | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/leave${canDecide ? "?scope=all" : ""}`);
      if (!res.ok) throw new Error("Something went wrong loading leave.");
      const d = await res.json();
      setRows(d.requests ?? []);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [canDecide]);

  useEffect(() => { load(); }, [load]);

  const [personFilter, setPersonFilter] = useState<string | null>(null);
  useEffect(() => {
    if (focusUserId) { setPersonFilter(focusUserId); onFocusHandled?.(); }
  }, [focusUserId, onFocusHandled]);

  const all = rows ?? [];
  const pending = useMemo(
    () => all.filter((r) => r.status === "PENDING"
      && matchesQuery({ name: r.user.name }, query)
      && (!personFilter || r.userId === personFilter)),
    [all, query, personFilter],
  );

  /** Everything that has been decided, filtered by the toolbar. */
  const decided = useMemo(() => all.filter((r) => {
    if (r.status === "PENDING") return false;
    if (!matchesQuery({ name: r.user.name }, query)) return false;
    if (personFilter && r.userId !== personFilter) return false;
    if (status && r.status !== status) return false;
    if (kindFilter && r.kind !== kindFilter) return false;
    if (!inMonth(r, month)) return false;
    return true;
  }), [all, query, personFilter, status, kindFilter, month]);

  const approvedThisMonth = useMemo(
    () => all.filter((r) => r.status === "APPROVED" && inMonth(r, month)),
    [all, month],
  );

  const stats = useMemo(() => ({
    pending: all.filter((r) => r.status === "PENDING").length,
    approved: approvedThisMonth.length,
    days: approvedThisMonth.reduce((n, r) => n + r.days, 0),
    unpaid: approvedThisMonth.filter((r) => r.kind === "UNPAID").reduce((n, r) => n + r.days, 0),
  }), [all, approvedThisMonth]);

  const filtersOn = !!(status || kindFilter || personFilter);
  const opened = all.find((r) => r.id === open) ?? null;
  const focusName = personFilter ? all.find((r) => r.userId === personFilter)?.user.name : null;

  async function decline(r: Req) {
    const ok = await confirm({
      title: `Decline ${r.user.name.split(" ")[0]}'s leave?`,
      message: `${dateRange(r.start, r.end)} · ${r.days} day${r.days === 1 ? "" : "s"}. They'll be told it was declined.`,
      confirmLabel: "Decline",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/hr/leave/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Couldn't save that");
      toast.success("Declined");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    } finally { setBusy(null); }
  }

  async function cancel(r: Req) {
    const ok = await confirm({
      title: r.status === "APPROVED" ? "Revoke this leave?" : "Withdraw this request?",
      message: r.status === "APPROVED"
        ? `${r.user.name} will be bookable again on those days, and the block on their diary is removed.`
        : "It will disappear from the approver's list.",
      confirmLabel: r.status === "APPROVED" ? "Revoke" : "Withdraw",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/hr/leave/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Couldn't do that");
      toast.success(r.status === "APPROVED" ? "Revoked" : "Withdrawn");
      setOpen(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper month={month} onChange={setMonth} />
        <Select
          value={status} onChange={setStatus} allowEmpty placeholder="All statuses" size="sm"
          options={[
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Declined" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
          className="min-w-[8.5rem]"
        />
        <Select
          value={kindFilter} onChange={setKindFilter} allowEmpty placeholder="Paid and unpaid" size="sm"
          options={[{ value: "PAID", label: "Paid" }, { value: "UNPAID", label: "Unpaid" }]}
          className="min-w-[9rem]"
        />
        {focusName && (
          <StatusBadge tone="purple">Showing {focusName}</StatusBadge>
        )}
        {filtersOn && (
          <ClearFilters onClear={() => { setStatus(""); setKindFilter(""); setPersonFilter(null); }} />
        )}
        <Button size="sm" className="ml-auto" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAsking(true)}>
          {/* An admin entering somebody else's leave is not asking anyone for
              anything — the label should say what the button does for the
              person pressing it. */}
          {canDecide ? "Record leave" : "Ask for leave"}
        </Button>
      </div>

      {error ? (
        <LoadError message="Couldn't load leave" detail={error} onRetry={load} />
      ) : !rows ? (
        <div className="space-y-3"><CardsSkeleton /><TableSkeleton rows={5} /></div>
      ) : (
        <>
          <SummaryStrip>
            <SummaryCard
              label={canDecide ? "Waiting on you" : "Awaiting a decision"}
              value={stats.pending}
              tone={stats.pending > 0 ? "amber" : undefined}
            />
            <SummaryCard label={`Approved · ${monthName(month)}`} value={stats.approved} tone="green" />
            <SummaryCard label="Days off this month" value={stats.days} tone="blue" />
            <SummaryCard label="Unpaid days" value={stats.unpaid} />
          </SummaryStrip>

          <div className="grid gap-3 lg:grid-cols-[1fr_18rem] items-start">
            <div className="min-w-0 space-y-4">
              {pending.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1.5">
                    Pending requests <span className="text-gray-400 font-normal">({pending.length})</span>
                  </h2>
                  <ul className="space-y-1.5">
                    {pending.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/40 dark:bg-amber-500/[0.06] px-3 py-2.5"
                      >
                        <PersonAvatar name={r.user.name} url={r.user.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100">{r.user.name}</p>
                            <p className="text-[12px] text-gray-600 dark:text-slate-300">
                              {dateRange(r.start, r.end)} · {r.days} day{r.days === 1 ? "" : "s"}
                            </p>
                          </div>
                          <p className="text-[12px] text-gray-600 dark:text-slate-400 truncate">{r.reason}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Submitted {longDate(r.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {canDecide ? (
                            <>
                              <Button
                                size="sm" variant="secondary" onClick={() => decline(r)}
                                loading={busy === r.id} icon={<X className="w-3.5 h-3.5" />}
                              >
                                Decline
                              </Button>
                              <Button
                                size="sm" onClick={() => setDeciding(r)}
                                icon={<Check className="w-3.5 h-3.5" />}
                              >
                                Approve
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => cancel(r)}>
                              Withdraw
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1.5">
                  Decided · {monthName(month)}
                  <span className="text-gray-400 font-normal"> ({decided.length})</span>
                </h2>

                {decided.length === 0 ? (
                  <EmptyState
                    title={pending.length ? "Nothing decided this month" : "No leave this month"}
                    hint={
                      filtersOn || query
                        ? "Clear the filters, or step to another month."
                        : canDecide
                          ? "Approved and declined requests for this month appear here."
                          : "Your time off appears here once it has been decided."
                    }
                  />
                ) : (
                  <>
                    <div className="hidden sm:block">
                      <Table minWidth={820}>
                        <thead>
                          <tr>
                            <Th>Employee</Th>
                            <Th>Dates</Th>
                            <Th align="right">Days</Th>
                            <Th>Type</Th>
                            <Th>Reason</Th>
                            <Th>Decided by</Th>
                            <Th />
                          </tr>
                        </thead>
                        <tbody>
                          {decided.map((r) => (
                            <Row
                              key={r.id}
                              onOpen={() => setOpen(r.id)}
                              selected={open === r.id}
                              label={`Open ${r.user.name}'s leave`}
                            >
                              <Td><PersonCell name={r.user.name} url={r.user.avatarUrl} /></Td>
                              <Td nowrap className="text-gray-600 dark:text-slate-300">
                                {dateRange(r.start, r.end)}
                              </Td>
                              <Td align="right" className="text-gray-600 dark:text-slate-300">{r.days}</Td>
                              <Td>
                                {r.status === "APPROVED" ? (
                                  <StatusBadge tone={r.kind === "UNPAID" ? "grey" : "green"}>
                                    {r.kind === "UNPAID" ? "Unpaid" : "Paid"}
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                                )}
                              </Td>
                              <Td className="text-gray-600 dark:text-slate-300 max-w-[14rem] truncate">{r.reason}</Td>
                              <Td className="text-gray-600 dark:text-slate-300">{r.decidedBy?.name ?? "—"}</Td>
                              <Td align="right" className="w-10">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <RowMenu
                                    label={`Actions for ${r.user.name}'s leave`}
                                    items={[
                                      { label: "View details", onSelect: () => setOpen(r.id) },
                                      {
                                        label: "Revoke leave",
                                        onSelect: () => cancel(r),
                                        danger: true,
                                        disabled: !(canDecide && r.status === "APPROVED"),
                                      },
                                    ]}
                                  />
                                </div>
                              </Td>
                            </Row>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    <div className="sm:hidden space-y-1.5">
                      {decided.map((r) => (
                        <MobileCard key={r.id} onOpen={() => setOpen(r.id)} label={`Open ${r.user.name}'s leave`}>
                          <div className="flex items-center gap-2.5">
                            <PersonAvatar name={r.user.name} url={r.user.avatarUrl} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">
                                {r.user.name}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                                {dateRange(r.start, r.end)} · {r.days}d
                              </p>
                            </div>
                            <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                          </div>
                        </MobileCard>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            {/* The month at a glance, and who is out in it. */}
            <aside className="space-y-3 lg:sticky lg:top-2">
              <LeaveCalendar month={month} approved={approvedThisMonth} />
              <section className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 overflow-hidden">
                <header className="px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                    Team away this month
                  </h3>
                </header>
                {approvedThisMonth.length === 0 ? (
                  <p className="text-[12px] text-gray-400 px-3 py-4 text-center">
                    Nobody is booked off in {monthName(month)}.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {approvedThisMonth.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(r.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        >
                          <PersonAvatar name={r.user.name} url={r.user.avatarUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-gray-900 dark:text-slate-100 truncate">
                              {r.user.name}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                              {dateRange(r.start, r.end)}
                            </p>
                          </div>
                          <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
                            {r.days}d
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {opened && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={opened.user.name}
          subtitle={`${dateRange(opened.start, opened.end)} · ${opened.days} day${opened.days === 1 ? "" : "s"}`}
          label={`${opened.user.name}'s leave`}
          headerAside={<PersonAvatar name={opened.user.name} url={opened.user.avatarUrl} size="lg" />}
          footer={
            opened.status === "PENDING" && canDecide ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => decline(opened)}>
                  Decline
                </Button>
                <Button size="sm" className="flex-1" onClick={() => { setOpen(null); setDeciding(opened); }}>
                  Approve
                </Button>
              </div>
            ) : opened.status === "APPROVED" && canDecide ? (
              <Button size="sm" variant="secondary" className="w-full" onClick={() => cancel(opened)}>
                Revoke leave
              </Button>
            ) : opened.status === "PENDING" ? (
              <Button size="sm" variant="secondary" className="w-full" onClick={() => cancel(opened)}>
                Withdraw request
              </Button>
            ) : undefined
          }
        >
          <DrawerSection title="The request">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine label="Start" value={longDate(opened.start)} />
              <DrawerLine label="End" value={longDate(opened.end)} />
              <DrawerLine label="Duration" value={`${opened.days} day${opened.days === 1 ? "" : "s"}`} />
              <DrawerLine label="Submitted" value={longDate(opened.createdAt)} />
            </div>
          </DrawerSection>

          <DrawerSection title="Reason">
            <p className="text-[12px] text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{opened.reason}</p>
          </DrawerSection>

          <DrawerSection title="Decision">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine
                label="Status"
                value={<StatusBadge tone={STATUS_TONE[opened.status]}>{STATUS_LABEL[opened.status]}</StatusBadge>}
              />
              <DrawerLine
                label="Type"
                value={opened.kind ? (opened.kind === "UNPAID" ? "Unpaid leave" : "Paid leave") : "—"}
              />
              <DrawerLine label="Decided by" value={opened.decidedBy?.name ?? "—"} />
              <DrawerLine label="Decided on" value={opened.decidedAt ? longDate(opened.decidedAt) : "—"} />
              <DrawerLine label="Note" value={opened.decisionNote ?? "—"} tone="muted" />
            </div>
            {opened.status === "APPROVED" && (
              <p className="text-[10px] text-gray-400 mt-1.5">
                These days are blocked on their diary, so nobody can be assigned work
                due on them. Revoking the leave removes the block.
              </p>
            )}
          </DrawerSection>
        </Drawer>
      )}

      {asking && (
        <AskForLeave
          canRecordForOthers={canDecide}
          onClose={() => setAsking(false)}
          onDone={(recorded) => {
            setAsking(false);
            toast.success(recorded ? "Leave recorded" : "Sent for approval");
            load();
          }}
        />
      )}
      {deciding && (
        <Decide
          r={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The month, with the days somebody is off marked.
 *
 * A dot per day rather than a number: this answers "is the 20th thin" at a
 * glance, and the names are one click away in the list underneath. Making it
 * a second table would just be the table again, smaller.
 */
function LeaveCalendar({ month, approved }: { month: string; approved: Req[] }) {
  const days = useMemo(() => monthDays(month), [month]);
  const today = new Date().toISOString().slice(0, 10);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of approved) {
      for (const d of days) {
        if (d.key >= r.start && d.key <= r.end) {
          if (!m.has(d.key)) m.set(d.key, []);
          m.get(d.key)!.push(r.user.name);
        }
      }
    }
    return m;
  }, [approved, days]);

  // Monday-first, matching how the week is talked about here.
  const lead = days.length ? (days[0].dow + 6) % 7 : 0;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 p-3">
      <header className="flex items-center gap-1.5 mb-2">
        <CalendarDays className="w-3.5 h-3.5 text-gray-400" aria-hidden />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
          {monthName(month)}
        </h3>
      </header>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-[9px] uppercase text-gray-400 py-1">{d}</span>
        ))}
        {Array.from({ length: lead }).map((_, i) => <span key={`pad-${i}`} />)}
        {days.map((d) => {
          const who = byDay.get(d.key);
          const label = who
            ? `${shortDate(d.key)} — ${who.join(", ")}`
            : shortDate(d.key);
          return (
            <span
              key={d.key}
              title={label}
              aria-label={label}
              className={`relative h-6 flex items-center justify-center text-[11px] tabular-nums rounded ${
                d.key === today
                  ? "bg-indigo-600 text-white font-semibold"
                  : who
                    ? "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 font-medium"
                    : "text-gray-500 dark:text-slate-400"
              }`}
            >
              {d.dom}
              {who && d.key !== today && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-sky-500" aria-hidden />
              )}
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-sky-500" aria-hidden />
        Somebody is on approved leave
      </p>
    </section>
  );
}

function AskForLeave({
  canRecordForOthers, onClose, onDone,
}: {
  canRecordForOthers: boolean;
  onClose: () => void;
  onDone: (recorded: boolean) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    An admin recording somebody else's leave decides the kind there and then.
    Sending their own entry to a pending queue so they can approve it
    afterwards is the same form twice for a decision that was never in doubt.

    Leave the person blank and it is your own request, which still goes
    through approval like anybody's.
  */
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [forUser, setForUser] = useState("");
  const [kind, setKind] = useState<"PAID" | "UNPAID">("PAID");

  useEffect(() => {
    if (!canRecordForOthers) return;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setPeople(d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      })
      .catch(() => { /* the picker stays empty and it is your own request */ });
  }, [canRecordForOthers]);

  const forSomeoneElse = canRecordForOthers && !!forUser;
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= MIN_LEAVE_REASON;
  const rangeOk = !!start && !!end && end >= start;
  const days = rangeOk
    ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
    : 0;

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start, end, reason: trimmed,
          ...(forSomeoneElse ? { userId: forUser, kind } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't send that");
      }
      onDone(forSomeoneElse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose}
      title={forSomeoneElse ? "Record leave" : canRecordForOthers ? "Leave" : "Ask for leave"}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={send} loading={busy} disabled={!reasonOk || !rangeOk}>
            {forSomeoneElse ? `Record ${days} day${days === 1 ? "" : "s"}` : "Send for approval"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {canRecordForOthers && (
          <Field label="Who">
            <Select
              value={forUser} onChange={setForUser} allowEmpty
              placeholder="Me — send for approval"
              options={people.map((p) => ({ value: p.id, label: p.name }))}
              className="w-full"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input
              type="date" value={start} min={forSomeoneElse ? undefined : today}
              onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }}
              className={leaveInput}
            />
          </Field>
          <Field label="To">
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={leaveInput} />
          </Field>
        </div>
        {rangeOk && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            {dateRange(start, end)} · {days} day{days === 1 ? "" : "s"}
          </p>
        )}
        <Field label="Why">
          <textarea
            autoFocus rows={3} value={reason} maxLength={MAX_LEAVE_REASON}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sister's wedding · medical appointment · moving house"
            className={`${leaveInput} resize-none`}
          />
          {trimmed.length > 0 && !reasonOk && (
            <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">
              A few more words — the person deciding it needs something to go on.
            </span>
          )}
        </Field>
        {forSomeoneElse ? (
          <div>
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1.5">
              Paid or unpaid?
            </span>
            <div className="flex gap-2">
              {(["PAID", "UNPAID"] as const).map((k) => (
                <button
                  key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                    kind === k
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400 hover:border-gray-300"
                  }`}
                >
                  {k === "PAID" ? "Paid" : "Unpaid"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-2">
              Recorded as approved — the days block straight away.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            Whoever approves it decides whether it&rsquo;s paid.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Decide({ r, onClose, onDone }: { r: Req; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"PAID" | "UNPAID" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: "APPROVE" | "REJECT") => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/hr/leave/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, kind, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't save that");
      }
      toast.success(action === "APPROVE" ? "Approved" : "Declined");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose}
      title={`${r.user.name} — ${r.days} day${r.days === 1 ? "" : "s"}`}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={() => decide("REJECT")} loading={busy}
            icon={<X className="w-3.5 h-3.5" />}>
            Decline
          </Button>
          <Button size="sm" onClick={() => decide("APPROVE")} loading={busy} disabled={!kind}
            icon={<Check className="w-3.5 h-3.5" />}>
            Approve
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[11px] text-gray-500 dark:text-slate-400">
          {dateRange(r.start, r.end)} · submitted {longDate(r.createdAt)}
        </p>
        <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-snug">{r.reason}</p>
        <div>
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            If you approve, is it paid?
          </span>
          <div className="flex gap-2">
            {(["PAID", "UNPAID"] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                  kind === k
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400 hover:border-gray-300"
                }`}
              >
                {k === "PAID" ? "Paid" : "Unpaid"}
              </button>
            ))}
          </div>
          {!kind && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              Approve stays off until you pick one — payroll has to answer for it later.
            </p>
          )}
        </div>
        <Field label="Note (optional)">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${leaveInput} resize-none`} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

const leaveInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
