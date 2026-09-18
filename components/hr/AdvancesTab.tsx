"use client";

/**
 * Advances — money handed out, and what is left to come back.
 *
 * An advance is next month's pay, early. A loan is money lent that comes back
 * over several months. Same shape, so one table with a label rather than two
 * screens.
 *
 * Outstanding is amount minus repaid, computed here and on the server and
 * stored nowhere. A third number is a number that can disagree with the other
 * two, and eventually does.
 *
 * There is no OVERDUE badge. Overdue needs a date something was due by, and
 * nothing here records one — an advance comes back whenever payroll next runs.
 * Colouring a balance red because it is old would put a mark against somebody
 * for a deadline nobody ever set.
 *
 * The monthly recovery figure is advisory. It is what the payroll dialog
 * offers as a starting point; it does not move money on its own, because
 * taking money out of somebody's salary should stay a decision a person makes
 * each month.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, HandCoins, Download, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Drawer, DrawerLine, DrawerSection } from "@/components/people/Drawer";
import {
  PersonAvatar, PersonCell, StatusBadge, SummaryCard, SummaryStrip,
  Table, Th, Td, Row, RowMenu, EmptyState, TableSkeleton, CardsSkeleton,
  MobileCard,
} from "@/components/people/kit";
import {
  advanceState, longDate, matchesQuery, money as fmt, recoveryMonths,
} from "@/lib/people";

interface Advance {
  id: string; userId: string; kind: "ADVANCE" | "LOAN";
  amount: number; amountRepaid: number; outstanding: number;
  recoveryAmount: number | null;
  givenOn: string; note: string | null; closedAt: string | null;
  user: { id: string; name: string; avatarUrl: string | null };
}

export function AdvancesTab({
  currency, query, focusUserId, onFocusHandled,
}: {
  currency: string;
  query: string;
  focusUserId?: string | null;
  onFocusHandled?: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Advance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Advance | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [scope, setScope] = useState<"open" | "all">("open");

  const money = useCallback((n: number | null) => fmt(n, currency), [currency]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/advances${scope === "all" ? "?includeClosed=1" : ""}`);
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "Advances aren't part of your access."
          : "Something went wrong loading advances.");
      }
      const d = await res.json();
      setRows(d.advances ?? []);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!focusUserId || !rows) return;
    const first = rows.find((a) => a.userId === focusUserId);
    if (first) setOpen(first.id);
    onFocusHandled?.();
  }, [focusUserId, rows, onFocusHandled]);

  const shown = useMemo(
    () => (rows ?? []).filter((a) => matchesQuery({ name: a.user.name }, query)),
    [rows, query],
  );

  const stats = useMemo(() => {
    const all = rows ?? [];
    const live = all.filter((a) => !a.closedAt);
    return {
      outstanding: live.reduce((s, a) => s + a.outstanding, 0),
      active: live.length,
      recovered: all.reduce((s, a) => s + a.amountRepaid, 0),
      unplanned: live.filter((a) => a.recoveryAmount == null).length,
    };
  }, [rows]);

  const exportCsv = () => {
    if (!rows) return;
    const head = ["Employee", "Type", "Amount", "Given on", "Recovery per month", "Recovered", "Outstanding", "Status", "Note"];
    const body = rows.map((a) => [
      a.user.name, a.kind, a.amount, a.givenOn.slice(0, 10),
      a.recoveryAmount ?? "", a.amountRepaid, a.outstanding,
      advanceState(a.closedAt), a.note ?? "",
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
    a.download = "advances.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const opened = (rows ?? []).find((a) => a.id === open) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={scope} onChange={(v) => setScope(v as "open" | "all")} size="sm"
          options={[
            { value: "open", label: "Still outstanding" },
            { value: "all", label: "Including settled" },
          ]}
          className="min-w-[10rem]"
        />
        <Button
          size="sm" variant="secondary" className="ml-auto"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!rows?.length}
        >
          Export
        </Button>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
          Record advance
        </Button>
      </div>

      {error ? (
        <LoadError message="Couldn't load advances" detail={error} onRetry={load} />
      ) : !rows ? (
        <div className="space-y-3"><CardsSkeleton /><TableSkeleton rows={4} /></div>
      ) : (
        <>
          <SummaryStrip>
            <SummaryCard label="Total outstanding" value={money(stats.outstanding)} tone="amber" />
            <SummaryCard label="Active advances" value={stats.active} />
            <SummaryCard
              label="Recovered to date" value={money(stats.recovered)} tone="green"
              title="Across every advance shown, from payroll and from repayments recorded by hand"
            />
            <SummaryCard
              label="No recovery plan" value={stats.unplanned}
              tone={stats.unplanned > 0 ? "grey" : undefined}
              title="Outstanding advances with no agreed monthly figure — they come back whenever payroll next recovers them"
            />
          </SummaryStrip>

          {shown.length === 0 ? (
            <EmptyState
              title={query ? "Nobody matches that" : "No advances yet"}
              hint={
                query
                  ? "Clear the search to see everything."
                  : "Once somebody receives an advance or a loan, it appears here with what is left to come back."
              }
              icon={<HandCoins className="w-7 h-7" />}
              action={!query ? (
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
                  Record advance
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              <div className="hidden sm:block">
                <Table minWidth={900}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Type</Th>
                      <Th align="right">Amount</Th>
                      <Th>Date</Th>
                      <Th align="right">Recovery</Th>
                      <Th align="right">Outstanding</Th>
                      <Th>Status</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a) => {
                      const state = advanceState(a.closedAt);
                      return (
                        <Row
                          key={a.id}
                          onOpen={() => setOpen(a.id)}
                          selected={open === a.id}
                          label={`Open ${a.user.name}'s advance`}
                        >
                          <Td><PersonCell name={a.user.name} url={a.user.avatarUrl} /></Td>
                          <Td className="text-gray-600 dark:text-slate-300">
                            {a.kind === "LOAN" ? "Loan" : "Advance"}
                          </Td>
                          <Td align="right" className="text-gray-900 dark:text-slate-100">{money(a.amount)}</Td>
                          <Td nowrap className="text-gray-600 dark:text-slate-300">{longDate(a.givenOn)}</Td>
                          <Td align="right" className="text-gray-600 dark:text-slate-300">
                            {a.recoveryAmount
                              ? <span className="whitespace-nowrap">{money(a.recoveryAmount)} <span className="text-gray-400">/mo</span></span>
                              : <span className="text-gray-400">—</span>}
                          </Td>
                          <Td align="right" className="font-semibold">
                            {a.outstanding > 0
                              ? <span className="text-amber-600 dark:text-amber-400">{money(a.outstanding)}</span>
                              : <span className="text-gray-400">—</span>}
                          </Td>
                          <Td>
                            <StatusBadge tone={state === "SETTLED" ? "green" : "amber"}>
                              {state === "SETTLED" ? "Settled" : "Active"}
                            </StatusBadge>
                          </Td>
                          <Td align="right" className="w-10">
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowMenu
                                label={`Actions for ${a.user.name}'s advance`}
                                items={[
                                  { label: "View details", onSelect: () => setOpen(a.id) },
                                  { label: "Record repayment", onSelect: () => setRepaying(a), disabled: !!a.closedAt },
                                ]}
                              />
                            </div>
                          </Td>
                        </Row>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div className="sm:hidden space-y-1.5">
                {shown.map((a) => {
                  const state = advanceState(a.closedAt);
                  return (
                    <MobileCard key={a.id} onOpen={() => setOpen(a.id)} label={`Open ${a.user.name}'s advance`}>
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={a.user.name} url={a.user.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">
                            {a.user.name}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                            {a.kind === "LOAN" ? "Loan" : "Advance"} · {money(a.amount)} · {longDate(a.givenOn)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[13px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {a.outstanding > 0 ? money(a.outstanding) : "—"}
                          </p>
                          <StatusBadge tone={state === "SETTLED" ? "green" : "amber"}>
                            {state === "SETTLED" ? "Settled" : "Active"}
                          </StatusBadge>
                        </div>
                      </div>
                    </MobileCard>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {opened && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={opened.user.name}
          subtitle={`${opened.kind === "LOAN" ? "Loan" : "Advance"} · ${longDate(opened.givenOn)}`}
          label={`${opened.user.name}'s advance`}
          headerAside={<PersonAvatar name={opened.user.name} url={opened.user.avatarUrl} size="lg" />}
          footer={
            !opened.closedAt ? (
              <Button
                size="sm" className="w-full" icon={<Wallet className="w-3.5 h-3.5" />}
                onClick={() => setRepaying(opened)}
              >
                Record a repayment
              </Button>
            ) : undefined
          }
        >
          <DrawerSection title="The money">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine label="Original amount" value={money(opened.amount)} />
              <DrawerLine label="Recovered so far" value={opened.amountRepaid ? money(opened.amountRepaid) : "—"} />
              <DrawerLine label="Outstanding" value={money(opened.outstanding)} tone="strong" />
            </div>
            {opened.amount > 0 && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((opened.amountRepaid / opened.amount) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {Math.round((opened.amountRepaid / opened.amount) * 100)}% recovered
                </p>
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Recovery">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine
                label="Per month"
                value={opened.recoveryAmount ? `${money(opened.recoveryAmount)} a month` : "Not agreed"}
              />
              <DrawerLine
                label="Estimated"
                value={(() => {
                  const m = recoveryMonths(opened.outstanding, opened.recoveryAmount);
                  return m == null ? "—" : `${m} more month${m === 1 ? "" : "s"}`;
                })()}
              />
              <DrawerLine
                label="Status"
                value={
                  <StatusBadge tone={opened.closedAt ? "green" : "amber"}>
                    {opened.closedAt ? "Settled" : "Active"}
                  </StatusBadge>
                }
              />
              {opened.closedAt && <DrawerLine label="Settled on" value={longDate(opened.closedAt)} />}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              An estimate from the balance, not a schedule that runs by itself. Payroll
              still asks what to recover each month.
            </p>
          </DrawerSection>

          {opened.note && (
            <DrawerSection title="Note">
              <p className="text-[12px] text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{opened.note}</p>
            </DrawerSection>
          )}
        </Drawer>
      )}

      {adding && (
        <RecordAdvance
          currency={currency}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); toast.success("Recorded"); load(); }}
        />
      )}
      {repaying && (
        <Repay
          a={repaying} currency={currency}
          onClose={() => setRepaying(null)}
          onDone={() => { setRepaying(null); toast.success("Recorded"); load(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Recording one.
 *
 * The live summary at the bottom is the point of the redesign: the number of
 * months only appears once there is a real amount AND a real monthly figure,
 * so the form never shows an estimate it made up from a half-filled box. The
 * button stays disabled until the request would actually succeed, which is
 * cheaper than a round trip that comes back with a validation error.
 */
function RecordAdvance({
  currency, onClose, onDone,
}: {
  currency: string; onClose: () => void; onDone: () => void;
}) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<"ADVANCE" | "LOAN">("ADVANCE");
  const [amount, setAmount] = useState("");
  const [recovery, setRecovery] = useState("");
  const [givenOn, setGivenOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setPeople(d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      })
      .catch(() => { /* the field shows empty and the button stays disabled */ });
  }, []);

  const money = (n: number) => fmt(n, currency);
  const amt = Number(amount);
  const rec = Number(recovery);
  const amountOk = Number.isFinite(amt) && amt > 0;
  const recoveryOk = recovery === "" || (Number.isFinite(rec) && rec > 0 && rec <= amt);
  const ready = !!userId && amountOk && recoveryOk;
  const months = amountOk && recovery !== "" && recoveryOk ? recoveryMonths(amt, rec) : null;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, kind, amount: amt, givenOn,
          recoveryAmount: recovery === "" ? null : rec,
          note,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't record that");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} title="Record an advance" width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} loading={busy} disabled={!ready}
            icon={<HandCoins className="w-3.5 h-3.5" />}>
            Record advance
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[12px] text-gray-500 dark:text-slate-400 -mt-1">
          Add an advance or a loan for somebody on the team.
        </p>

        <Field label="Employee">
          <Select
            value={userId} onChange={setUserId} allowEmpty placeholder="Choose someone"
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            className="w-full"
          />
        </Field>

        <Field label="Type">
          <div className="flex gap-2">
            {(["ADVANCE", "LOAN"] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                  kind === k
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                {k === "ADVANCE" ? "Advance" : "Loan"}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-gray-400 mt-1">
            {kind === "ADVANCE"
              ? "Next month's pay, early."
              : "Money lent, coming back over several months."}
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${currency})`}>
            <input
              type="number" min="1" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && !amountOk}
              className={advInput}
            />
            {amount !== "" && !amountOk && (
              <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">
                Enter an amount greater than zero.
              </span>
            )}
          </Field>
          <Field label="Given on">
            <input type="date" value={givenOn} onChange={(e) => setGivenOn(e.target.value)} className={advInput} />
          </Field>
        </div>

        <Field label="Recovered each month (optional)">
          <input
            type="number" min="1" value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            aria-invalid={recovery !== "" && !recoveryOk}
            placeholder="Leave blank if not agreed"
            className={advInput}
          />
          {recovery !== "" && !recoveryOk && (
            <span className="block text-[11px] text-red-600 dark:text-red-400 mt-1">
              {rec > amt
                ? "That's more than the advance itself."
                : "Enter an amount greater than zero, or leave it blank."}
            </span>
          )}
          <span className="block text-[11px] text-gray-400 mt-1">
            Recovered from payroll. It&rsquo;s the figure the pay dialog offers — it never
            deducts on its own.
          </span>
        </Field>

        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={advInput} />
        </Field>

        {/* Only once there is something true to say. */}
        {amountOk && (
          <div className="rounded-lg bg-gray-50 dark:bg-white/[0.04] px-3 py-2.5 space-y-0.5">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">
              {money(amt)} {kind === "LOAN" ? "loan" : "advance"}
            </p>
            {months != null ? (
              <p className="text-[12px] text-gray-600 dark:text-slate-300">
                {money(rec)} recovered monthly · about {months} month{months === 1 ? "" : "s"} to clear
              </p>
            ) : (
              <p className="text-[12px] text-gray-500 dark:text-slate-400">
                No monthly figure set — it comes back whenever payroll next recovers it.
              </p>
            )}
          </div>
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

function Repay({
  a, currency, onClose, onDone,
}: {
  a: Advance; currency: string; onClose: () => void; onDone: () => void;
}) {
  const [value, setValue] = useState(a.recoveryAmount ? String(Math.min(a.recoveryAmount, a.outstanding)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => fmt(n, currency);
  const n = Number(value);
  const ok = Number.isFinite(n) && n > 0;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, repay: n }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't record that");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const left = Math.max(0, a.outstanding - Math.min(n || 0, a.outstanding));

  return (
    <Modal
      open onClose={onClose} title={`Repayment from ${a.user.name}`} width="max-w-sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} loading={busy} disabled={!ok}>Record</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          {money(a.outstanding)} outstanding. Money recovered from a payslip is recorded
          on Payroll instead, so it moves the payslip too.
        </p>
        <Field label="Amount received">
          <input
            autoFocus type="number" min="1" max={a.outstanding}
            value={value} onChange={(e) => setValue(e.target.value)} className={advInput}
          />
        </Field>
        {ok && (
          <div className="rounded-lg bg-gray-50 dark:bg-white/[0.04] px-3 py-2 flex items-center justify-between">
            <span className="text-[12px] text-gray-500 dark:text-slate-400">Left after this</span>
            <span className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {money(left)}
            </span>
          </div>
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

const advInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
