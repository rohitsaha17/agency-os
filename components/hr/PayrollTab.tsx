"use client";

/**
 * Payroll — what the company owes the team this month, and what it has paid.
 *
 * The sheet is not stored. It is built each time from the people on the books
 * plus whatever payments exist for the month, so somebody hired mid-month
 * appears without anyone regenerating anything and an untouched month shows
 * everyone unpaid rather than blank.
 *
 * Nowhere does a missing salary become a zero. A sheet that prints ₹0 reads
 * as "this person earns nothing"; the row instead says the salary has not
 * been configured and offers the one action that fixes it. Every total on
 * this screen comes from the API's own arithmetic — none of it is computed
 * twice, and none of it is typed in.
 *
 * Recovering an advance out of a payslip moves two things at once: the net
 * falls and the loan's balance falls. Both happen server-side in one
 * transaction; the dialog mirrors the same capping rule only so the number
 * somebody sees before pressing the button is the number that gets written.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Wallet, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Drawer, DrawerLine, DrawerSection } from "@/components/people/Drawer";
import {
  PersonAvatar, PersonCell, StatusBadge, SummaryCard, SummaryStrip,
  MonthStepper, Table, Th, Td, Row, RowMenu, EmptyState, TableSkeleton,
  CardsSkeleton, MobileCard,
} from "@/components/people/kit";
import { longDate, matchesQuery, money as fmt, monthName } from "@/lib/people";

interface PayRow {
  userId: string; name: string; avatarUrl: string | null; craft: string | null;
  monthlySalary: number | null; advanceOutstanding: number;
  gross: number; advanceDeducted: number; net: number;
  status: "PAID" | "UNPAID"; paidOn: string | null; note: string | null;
}
interface Totals {
  people: number; unset: number; gross: number; deducted: number;
  net: number; paid: number; paidCount: number;
}

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PayrollTab({
  currency, query, focusUserId, onFocusHandled,
}: {
  currency: string;
  query: string;
  focusUserId?: string | null;
  onFocusHandled?: () => void;
}) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const money = useCallback((n: number | null) => fmt(n, currency), [currency]);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const res = await fetch(`/api/hr/payroll?month=${month}`);
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "Payroll isn't part of your access."
          : "Something went wrong loading this month's payroll.");
      }
      const d = await res.json();
      setRows(d.rows ?? []);
      setTotals(d.totals ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focusUserId) { setOpen(focusUserId); onFocusHandled?.(); }
  }, [focusUserId, onFocusHandled]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => matchesQuery(r, query) && (!onlyUnpaid || r.status === "UNPAID")),
    [rows, query, onlyUnpaid],
  );

  const exportCsv = () => {
    if (!rows) return;
    const head = ["Name", "Role", "Monthly salary", "Gross", "Deductions", "Advance recovered", "Net", "Status", "Paid on"];
    const body = rows.map((r) => [
      r.name, r.craft ?? "", r.monthlySalary ?? "", r.gross, 0, r.advanceDeducted, r.net,
      r.status, r.paidOn ? r.paidOn.slice(0, 10) : "",
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
    a.download = `salary-sheet-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const opened = (rows ?? []).find((r) => r.userId === open) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper month={month} onChange={setMonth} />
        <Button
          size="sm" variant="secondary" className="ml-auto"
          icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!rows?.length}
        >
          Generate salary sheet
        </Button>
        <Button
          size="sm" variant="secondary"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!rows?.length}
        >
          Export
        </Button>
      </div>

      {error ? (
        <LoadError message="Couldn't load payroll" detail={error} onRetry={load} />
      ) : !rows || !totals ? (
        <div className="space-y-3"><CardsSkeleton /><TableSkeleton rows={6} /></div>
      ) : (
        <>
          <SummaryStrip>
            <SummaryCard label={`Payroll total · ${monthName(month)}`} value={money(totals.net)} />
            <SummaryCard
              label="Paid" value={money(totals.paid)}
              hint={`${totals.paidCount}/${totals.people}`} tone="green"
            />
            <SummaryCard
              label="Outstanding" value={money(Math.max(0, totals.net - totals.paid))}
              tone={totals.net - totals.paid > 0 ? "amber" : undefined}
              active={onlyUnpaid}
              onClick={() => setOnlyUnpaid((v) => !v)}
            />
            <SummaryCard label="Advances recovered" value={money(totals.deducted)} tone="blue" />
          </SummaryStrip>

          {totals.unset > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
              <p className="text-[12px] text-amber-800 dark:text-amber-200">
                {totals.unset} {totals.unset === 1 ? "person has" : "people have"} no monthly salary
                configured, so this month&rsquo;s total leaves {totals.unset === 1 ? "them" : "them"} out.
                Set it on their record under Staff.
              </p>
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              title={query || onlyUnpaid ? "Nobody matches that" : "Nobody on the team yet"}
              hint={query || onlyUnpaid ? "Clear the search or the filter." : "People added under Staff appear on the sheet."}
            />
          ) : (
            <>
              <div className="hidden sm:block">
                <Table minWidth={860}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th align="right">Gross</Th>
                      <Th align="right">Advance</Th>
                      <Th align="right">Net</Th>
                      <Th>Status</Th>
                      <Th>Pay date</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const unconfigured = r.monthlySalary == null && r.status === "UNPAID";
                      return (
                        <Row
                          key={r.userId}
                          onOpen={() => setOpen(r.userId)}
                          selected={open === r.userId}
                          label={`Open ${r.name}'s payslip`}
                        >
                          <Td><PersonCell name={r.name} url={r.avatarUrl} secondary={r.craft} /></Td>
                          <Td align="right" className="text-gray-900 dark:text-slate-100">
                            {unconfigured
                              ? <span className="text-amber-600 dark:text-amber-400 text-[11px]">Salary not configured</span>
                              : money(r.gross)}
                          </Td>
                          <Td align="right" className="text-gray-600 dark:text-slate-300">
                            {r.advanceDeducted ? money(r.advanceDeducted) : <span className="text-gray-400">—</span>}
                          </Td>
                          <Td align="right" className="font-semibold text-gray-900 dark:text-slate-100">
                            {unconfigured ? <span className="text-gray-400">—</span> : money(r.net)}
                          </Td>
                          <Td>
                            <StatusBadge tone={r.status === "PAID" ? "green" : "grey"}>{r.status}</StatusBadge>
                          </Td>
                          <Td nowrap className="text-gray-600 dark:text-slate-300">
                            {r.paidOn ? longDate(r.paidOn) : "—"}
                          </Td>
                          <Td align="right" className="w-10">
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowMenu
                                label={`Actions for ${r.name}`}
                                items={[
                                  { label: "View payslip", onSelect: () => setOpen(r.userId) },
                                  {
                                    label: r.status === "PAID" ? "Revise this payment" : "Mark paid",
                                    onSelect: () => setPaying(r),
                                  },
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
                {shown.map((r) => (
                  <MobileCard key={r.userId} onOpen={() => setOpen(r.userId)} label={`Open ${r.name}'s payslip`}>
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar name={r.name} url={r.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{r.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          {r.monthlySalary == null && r.status === "UNPAID"
                            ? "Salary not configured"
                            : `Net ${money(r.net)}`}
                        </p>
                      </div>
                      <StatusBadge tone={r.status === "PAID" ? "green" : "grey"}>{r.status}</StatusBadge>
                    </div>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {opened && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={opened.name}
          subtitle={`${opened.craft ?? "Team"} · ${monthName(month)}`}
          label={`${opened.name}'s payslip`}
          headerAside={<PersonAvatar name={opened.name} url={opened.avatarUrl} size="lg" />}
          footer={
            <Button size="sm" className="w-full" icon={<Wallet className="w-3.5 h-3.5" />}
              onClick={() => setPaying(opened)}>
              {opened.status === "PAID" ? "Revise this payment" : "Mark paid"}
            </Button>
          }
        >
          <DrawerSection title="This month">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine
                label="Gross salary"
                value={opened.monthlySalary == null && opened.status === "UNPAID"
                  ? <span className="text-amber-600 dark:text-amber-400">Not configured</span>
                  : money(opened.gross)}
              />
              <DrawerLine label="Deductions" value={<span className="text-gray-400">—</span>} />
              <DrawerLine
                label="Advance recovery"
                value={opened.advanceDeducted ? money(opened.advanceDeducted) : "—"}
              />
              <DrawerLine
                label="Net payable"
                value={opened.monthlySalary == null && opened.status === "UNPAID" ? "—" : money(opened.net)}
                tone="strong"
              />
            </div>
          </DrawerSection>

          <DrawerSection title="Payment status">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine
                label="Status"
                value={<StatusBadge tone={opened.status === "PAID" ? "green" : "grey"}>{opened.status}</StatusBadge>}
              />
              <DrawerLine label="Paid on" value={opened.paidOn ? longDate(opened.paidOn) : "—"} />
              <DrawerLine label="Note" value={opened.note ?? "—"} tone="muted" />
            </div>
          </DrawerSection>

          <DrawerSection title="Advances">
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1">
              <DrawerLine
                label="Still outstanding"
                value={opened.advanceOutstanding ? money(opened.advanceOutstanding) : "Nothing outstanding"}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Recovering an advance here lowers this payslip and the balance together.
            </p>
          </DrawerSection>
        </Drawer>
      )}

      {paying && (
        <MarkPaid
          row={paying} month={month} currency={currency}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); toast.success("Recorded"); load(); }}
        />
      )}
    </div>
  );
}

function MarkPaid({
  row, month, currency, onClose, onDone,
}: {
  row: PayRow; month: string; currency: string; onClose: () => void; onDone: () => void;
}) {
  const [gross, setGross] = useState(String(row.monthlySalary ?? row.gross ?? ""));
  const [deduct, setDeduct] = useState(String(row.advanceDeducted || 0));
  const [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const g = Number(gross) || 0;
  // Mirrors the server's rule so the number on screen is the number that gets
  // written: never more than is owed, never more than the month pays.
  const d = Math.max(0, Math.min(Number(deduct) || 0, row.advanceOutstanding, g));
  const net = Math.max(0, g - d);
  const money = (n: number) => fmt(n, currency);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, userId: row.userId, gross: g, advanceDeducted: d, note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Couldn't record that");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose}
      title={`${row.status === "PAID" ? "Revise" : "Pay"} ${row.name}`}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} loading={busy} disabled={g <= 0}>
            {row.status === "PAID" ? "Save changes" : "Mark paid"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          {monthName(month)} · {row.craft ?? "Team"}
        </p>

        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">
            Gross ({currency})
          </span>
          <input type="number" min="0" value={gross} onChange={(e) => setGross(e.target.value)} className={payInput} />
          {row.monthlySalary == null && (
            <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              No monthly salary is set on their record — whatever you enter here applies to this month only.
            </span>
          )}
        </label>

        {row.advanceOutstanding > 0 && (
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">
              Recover from advance
              <span className="text-gray-400"> · {money(row.advanceOutstanding)} outstanding</span>
            </span>
            <input
              type="number" min="0" max={Math.min(row.advanceOutstanding, g)}
              value={deduct} onChange={(e) => setDeduct(e.target.value)} className={payInput}
            />
          </label>
        )}

        <div className="rounded-lg bg-gray-50 dark:bg-white/[0.04] px-3 py-2 space-y-1">
          <Line label="Gross" value={money(g)} />
          {d > 0 && <Line label="Advance recovered" value={`− ${money(d)}`} />}
          <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-white/[0.08]">
            <span className="text-[12px] font-medium text-gray-700 dark:text-slate-200">Net payable</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{money(net)}</span>
          </div>
        </div>

        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={payInput} />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-gray-700 dark:text-slate-200 tabular-nums">{value}</span>
    </div>
  );
}

const payInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
