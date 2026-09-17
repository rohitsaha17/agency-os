"use client";

/**
 * The salary sheet for a month.
 *
 * Not stored — built from the people on the books plus whatever payments
 * exist for that month, so somebody hired mid-month appears without anyone
 * regenerating anything, and an untouched month shows everyone unpaid rather
 * than blank.
 *
 * "not set" is printed where a salary is missing, never 0. A sheet that says
 * zero reads as "this person earns nothing"; a sheet that says not set reads
 * as "somebody still has to enter this", which is the true statement.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/hr/TodayTab";

interface Row {
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

export function PayrollTab({ currency }: { currency: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<Row | null>(null);

  const money = (n: number) =>
    n.toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const res = await fetch(`/api/hr/payroll?month=${month}`);
      if (!res.ok) throw new Error(res.status === 403 ? "Payroll isn't part of your access." : `The server returned ${res.status}.`);
      const d = await res.json();
      setRows(d.rows ?? []);
      setTotals(d.totals ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!rows) return;
    const head = ["Name", "Role", "Monthly salary", "Gross", "Advance recovered", "Net", "Status", "Paid on"];
    const body = rows.map((r) => [
      r.name, r.craft ?? "", r.monthlySalary ?? "", r.gross, r.advanceDeducted, r.net,
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

  if (error) return <LoadError message="Couldn't load payroll" detail={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <Button size="sm" variant="secondary" icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportCsv} disabled={!rows?.length}>
          Salary sheet
        </Button>
      </div>

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Net payable" value={money(totals.net)} />
          <Stat label="Paid" value={`${money(totals.paid)}`} sub={`${totals.paidCount} of ${totals.people}`} />
          <Stat label="Advance recovered" value={money(totals.deducted)} />
          <Stat label="Salary not set" value={String(totals.unset)}
            tone={totals.unset > 0 ? "amber" : undefined} />
        </div>
      )}

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-white/[0.08]">
                <th className="py-2 px-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium text-right">Gross</th>
                <th className="py-2 px-3 font-medium text-right">Advance</th>
                <th className="py-2 px-3 font-medium text-right">Net</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-gray-100 dark:border-white/[0.05]">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={r.name} url={r.avatarUrl} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-slate-100 truncate">{r.name}</p>
                        {r.craft && <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{r.craft}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-900 dark:text-slate-100">
                    {r.monthlySalary == null && r.status === "UNPAID"
                      ? <span className="text-amber-600 dark:text-amber-400">not set</span>
                      : money(r.gross)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-600 dark:text-slate-300">
                    {r.advanceDeducted ? money(r.advanceDeducted) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900 dark:text-slate-100">
                    {r.monthlySalary == null && r.status === "UNPAID" ? "—" : money(r.net)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      r.status === "PAID"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-slate-400"
                    }`}>
                      {r.status}
                    </span>
                    {r.paidOn && (
                      <span className="ml-1.5 text-[11px] text-gray-400">
                        {new Date(r.paidOn).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {r.status === "UNPAID" && (
                      <Button size="sm" variant="secondary" onClick={() => setPaying(r)}
                        icon={<Wallet className="w-3.5 h-3.5" />}>
                        Mark paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying && (
        <MarkPaid row={paying} month={month} currency={currency}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); toast.success("Recorded"); load(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" }) {
  return (
    <div className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl">
      <p className="text-[11px] text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 tabular-nums ${
        tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-slate-100"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MarkPaid({ row, month, currency, onClose, onDone }: {
  row: Row; month: string; currency: string; onClose: () => void; onDone: () => void;
}) {
  const [gross, setGross] = useState(String(row.monthlySalary ?? row.gross ?? ""));
  const [deduct, setDeduct] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const g = Number(gross) || 0;
  // Mirrors the server's rule so the number on screen is the number that gets
  // written: never more than is owed, never more than the month pays.
  const d = Math.max(0, Math.min(Number(deduct) || 0, row.advanceOutstanding, g));
  const net = Math.max(0, g - d);
  const money = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

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
    <Modal open onClose={onClose} title={`Pay ${row.name} — ${month}`} width="max-w-sm" compact
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 px-1">Cancel</button>
          <Button size="sm" onClick={save} loading={busy} disabled={g <= 0}>Mark paid</Button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Gross</span>
          <input type="number" min="0" value={gross} onChange={(e) => setGross(e.target.value)} className={payInput} />
        </label>
        {row.advanceOutstanding > 0 && (
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">
              Recover from advance ({money(row.advanceOutstanding)} outstanding)
            </span>
            <input type="number" min="0" max={Math.min(row.advanceOutstanding, g)}
              value={deduct} onChange={(e) => setDeduct(e.target.value)} className={payInput} />
          </label>
        )}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-white/[0.04] rounded-lg">
          <span className="text-[12px] text-gray-500 dark:text-slate-400">Net</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{money(net)}</span>
        </div>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={payInput} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

const payInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
