"use client";

/**
 * Advances and loans.
 *
 * An advance is next month's pay, early. A loan is money lent that comes
 * back over several months. The agency decides which word applies; the
 * software treats them the same and just carries the label.
 *
 * Outstanding is always amount minus repaid, computed here and on the
 * server, never stored. A third number is a number that can disagree.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, HandCoins } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/hr/TodayTab";

interface Advance {
  id: string; userId: string; kind: "ADVANCE" | "LOAN";
  amount: number; amountRepaid: number; outstanding: number;
  givenOn: string; note: string | null; closedAt: string | null;
  user: { id: string; name: string; avatarUrl: string | null };
}

export function AdvancesTab({ currency }: { currency: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Advance[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Advance | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const money = (n: number) =>
    n.toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/advances${showClosed ? "?includeClosed=1" : ""}`);
      if (!res.ok) throw new Error(res.status === 403 ? "Advances aren't part of your access." : `The server returned ${res.status}.`);
      const d = await res.json();
      setRows(d.advances ?? []);
      setTotal(d.totals?.outstanding ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [showClosed]);

  useEffect(() => { load(); }, [load]);

  if (error) return <LoadError message="Couldn't load advances" detail={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl">
          <span className="text-[11px] text-gray-500 dark:text-slate-400">Outstanding </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{money(total)}</span>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)}
            data-fixed-size className="rounded border-gray-300" />
          Show settled
        </label>
        <Button size="sm" className="ml-auto" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
          Record advance
        </Button>
      </div>

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">
          Nothing lent out{showClosed ? " ever" : " right now"}.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <div key={a.id}
              className={`flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 border rounded-xl ${
                a.closedAt ? "border-gray-100 dark:border-white/[0.05] opacity-60" : "border-gray-200 dark:border-white/[0.08]"}`}>
              <Avatar name={a.user.name} url={a.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100">{a.user.name}</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-slate-400">
                    {a.kind}
                  </span>
                  {a.closedAt && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      SETTLED
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                  {money(a.amount)} on {new Date(a.givenOn).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  {a.amountRepaid > 0 && ` · ${money(a.amountRepaid)} back`}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-semibold tabular-nums ${
                  a.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                  {money(a.outstanding)}
                </p>
                {!a.closedAt && (
                  <button type="button" onClick={() => setRepaying(a)}
                    className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:underline">
                    Record repayment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <AddAdvance onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast.success("Recorded"); load(); }} />}
      {repaying && (
        <Repay a={repaying} currency={currency}
          onClose={() => setRepaying(null)}
          onDone={() => { setRepaying(null); toast.success("Recorded"); load(); }} />
      )}
    </div>
  );
}

function AddAdvance({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<"ADVANCE" | "LOAN">("ADVANCE");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => {
      if (Array.isArray(d)) setPeople(d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, kind, amount: Number(amount), note }),
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
    <Modal open onClose={onClose} title="Record an advance" width="max-w-sm" compact
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 px-1">Cancel</button>
          <Button size="sm" onClick={save} loading={busy} disabled={!userId || !(Number(amount) > 0)}
            icon={<HandCoins className="w-3.5 h-3.5" />}>Record</Button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Who</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={advInput}>
            <option value="">Choose someone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          {(["ADVANCE", "LOAN"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-surface duration-150 ${
                kind === k
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                  : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400"
              }`}>
              {k === "ADVANCE" ? "Advance" : "Loan"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Amount</span>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={advInput} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={advInput} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

function Repay({ a, currency, onClose, onDone }: {
  a: Advance; currency: string; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, repay: Number(amount) }),
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
    <Modal open onClose={onClose} title={`Repayment from ${a.user.name}`} width="max-w-sm" compact
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 px-1">Cancel</button>
          <Button size="sm" onClick={save} loading={busy} disabled={!(Number(amount) > 0)}>Record</Button>
        </div>
      }>
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          {money(a.outstanding)} outstanding. Money recovered from a payslip is recorded on the Payroll tab instead.
        </p>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Amount received</span>
          <input autoFocus type="number" min="0" max={a.outstanding} value={amount}
            onChange={(e) => setAmount(e.target.value)} className={advInput} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

const advInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
