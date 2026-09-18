"use client";

/**
 * Leave — asking for it, and deciding it.
 *
 * One component for both sides, because they are the same list seen from two
 * chairs. An approver gets everybody's and a pair of buttons; everyone else
 * gets their own and a form.
 *
 * Approving forces a choice of paid or unpaid. There is no default, and the
 * approve button stays disabled until one is picked — an approval with no
 * kind is a decision that hasn't been made, and it is the payroll sheet that
 * would have to answer for it later.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Check, X, Clock, CalendarCheck, CalendarX, Plane } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadError";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Avatar } from "@/components/hr/TodayTab";
import { MIN_LEAVE_REASON, MAX_LEAVE_REASON } from "@/lib/hr";

interface Req {
  id: string; userId: string; start: string; end: string; days: number;
  reason: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  kind: "PAID" | "UNPAID" | null; decisionNote: string | null;
  user: { id: string; name: string; avatarUrl: string | null };
  decidedBy: { id: string; name: string } | null;
}

const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

const TONE: Record<Req["status"], string> = {
  PENDING: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  CANCELLED: "bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-slate-400",
};

export function LeaveTab({ canDecide }: { canDecide: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<Req | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/leave${canDecide ? "?scope=all" : ""}`);
      if (!res.ok) throw new Error(`The server returned ${res.status}.`);
      const d = await res.json();
      setRows(d.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, [canDecide]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (r: Req) => {
    if (r.status === "APPROVED") {
      const ok = await confirm({
        title: "Revoke this leave?",
        message: `${r.user.name} will be bookable again on those days, and the block on their diary is removed.`,
        confirmLabel: "Revoke",
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/hr/leave/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      });
      if (!res.ok) throw new Error();
      toast.success(r.status === "APPROVED" ? "Revoked" : "Withdrawn");
      load();
    } catch { toast.error("Couldn't do that"); }
  };

  if (error) return <LoadError message="Couldn't load leave" detail={error} onRetry={load} />;

  const pending = (rows ?? []).filter((r) => r.status === "PENDING");
  const rest = (rows ?? []).filter((r) => r.status !== "PENDING");

  const approved = (rows ?? []).filter((r) => r.status === "APPROVED");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = approved.filter((r) => r.end >= today);
  const stats = [
    { icon: Clock, label: canDecide ? "Waiting on you" : "Awaiting a decision",
      value: pending.length, accent: pending.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400" },
    { icon: CalendarCheck, label: "Approved", value: approved.length, accent: "text-emerald-600 dark:text-emerald-400" },
    { icon: Plane, label: "Days approved", value: approved.reduce((n, r) => n + r.days, 0), accent: "text-sky-600 dark:text-sky-400" },
    { icon: CalendarX, label: "Unpaid days",
      value: approved.filter((r) => r.kind === "UNPAID").reduce((n, r) => n + r.days, 0),
      accent: "text-gray-600 dark:text-slate-300" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] text-gray-500 dark:text-slate-400">
          {canDecide ? "Everyone's time off" : "Your time off"}
        </div>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAsking(true)}>
          {/* An admin entering somebody else's leave is not asking anyone for
              anything — the label should say what the button does for the
              person pressing it. */}
          {canDecide ? "Record leave" : "Ask for leave"}
        </Button>
      </div>

      {rows !== null && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {stats.map((st) => {
            const Icon = st.icon;
            return (
              <div key={st.label}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  <Icon className="w-3 h-3" /> {st.label}
                </span>
                <span className={`block text-2xl font-semibold tabular-nums mt-0.5 ${st.accent}`}>
                  {st.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">
          {canDecide ? "No leave requests yet." : "You haven't asked for any leave."}
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <Section title={canDecide ? "Waiting on you" : "Waiting for a decision"}>
              {pending.map((r) => (
                <Row key={r.id} r={r} canDecide={canDecide}
                  onDecide={() => setDeciding(r)} onCancel={() => cancel(r)} />
              ))}
            </Section>
          )}
          {rest.length > 0 && (
            <Section title="Decided">
              {rest.map((r) => (
                <Row key={r.id} r={r} canDecide={false}
                  // Plans change. Revoking is what removes the days it blocked
                  // out — without it the diary keeps somebody off work for a
                  // trip that isn't happening.
                  onCancel={canDecide && r.status === "APPROVED" ? () => cancel(r) : undefined} />
              ))}
            </Section>
          )}
        </>
      )}

      {asking && (
        <AskForLeave
          canRecordForOthers={canDecide}
          onClose={() => setAsking(false)}
          onDone={(recorded) => { setAsking(false); toast.success(recorded ? "Recorded" : "Sent"); load(); }}
        />
      )}
      {deciding && <Decide r={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); load(); }} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ r, canDecide, onDecide, onCancel }: {
  r: Req; canDecide: boolean; onDecide?: () => void; onCancel?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl">
      <Avatar name={r.user.name} url={r.user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100">{r.user.name}</p>
          <span className="text-[11px] text-gray-500 dark:text-slate-400">
            {day(r.start)}{r.days > 1 ? ` – ${day(r.end)}` : ""} · {r.days} day{r.days === 1 ? "" : "s"}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TONE[r.status]}`}>
            {r.status === "APPROVED" && r.kind ? `${r.kind === "PAID" ? "PAID" : "UNPAID"} LEAVE` : r.status}
          </span>
        </div>
        <p className="text-[12px] text-gray-600 dark:text-slate-400 mt-1 leading-snug">{r.reason}</p>
        {r.decisionNote && (
          <p className="text-[11px] text-gray-500 dark:text-slate-500 mt-1 italic">
            {r.decidedBy?.name}: {r.decisionNote}
          </p>
        )}
      </div>
      {canDecide && onDecide && (
        <Button size="sm" variant="secondary" onClick={onDecide}>Decide</Button>
      )}
      {onCancel && (r.status === "PENDING" || r.status === "APPROVED") && (
        <button type="button" onClick={onCancel}
          className="text-[12px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 px-1 flex-shrink-0">
          {r.status === "APPROVED" ? "Revoke" : "Withdraw"}
        </button>
      )}
    </div>
  );
}

function AskForLeave({ canRecordForOthers, onClose, onDone }: {
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
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => {
      if (Array.isArray(d)) setPeople(d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
    }).catch(() => {});
  }, [canRecordForOthers]);

  const forSomeoneElse = canRecordForOthers && !!forUser;
  const ok = reason.trim().length >= MIN_LEAVE_REASON && start && end && end >= start;

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/hr/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start, end, reason,
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
    <Modal open onClose={onClose}
      title={forSomeoneElse ? "Record leave" : canRecordForOthers ? "Leave" : "Ask for leave"}
      width="max-w-sm" compact
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 px-1">Cancel</button>
          <Button size="sm" onClick={send} loading={busy} disabled={!ok}>
            {forSomeoneElse ? "Record" : "Send"}
          </Button>
        </div>
      }>
      <div className="space-y-3">
        {canRecordForOthers && (
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Who</span>
            <select value={forUser} onChange={(e) => setForUser(e.target.value)} className={leaveInput}>
              <option value="">Me — send for approval</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">From</span>
            <input type="date" value={start} min={today}
              onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }}
              className={leaveInput} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">To</span>
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={leaveInput} />
          </label>
        </div>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Why</span>
          <textarea autoFocus rows={3} value={reason} maxLength={MAX_LEAVE_REASON}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sister's wedding · medical appointment · moving house"
            className={`${leaveInput} resize-none`} />
        </label>
        {forSomeoneElse ? (
          <div>
            <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1.5">Paid or unpaid?</span>
            <div className="flex gap-2">
              {(["PAID", "UNPAID"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-surface duration-150 ${
                    kind === k
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400 hover:border-gray-300"
                  }`}>
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
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
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
    <Modal open onClose={onClose} title={`${r.user.name} — ${r.days} day${r.days === 1 ? "" : "s"}`} width="max-w-sm" compact
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={() => decide("REJECT")} loading={busy}
            icon={<X className="w-3.5 h-3.5" />}>Decline</Button>
          <Button size="sm" onClick={() => decide("APPROVE")} loading={busy} disabled={!kind}
            icon={<Check className="w-3.5 h-3.5" />}>Approve</Button>
        </div>
      }>
      <div className="space-y-3">
        <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-snug">{r.reason}</p>
        <p className="text-[11px] text-gray-500 dark:text-slate-400">
          {day(r.start)}{r.days > 1 ? ` – ${day(r.end)}` : ""}
        </p>
        <div>
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            If you approve, is it paid?
          </span>
          <div className="flex gap-2">
            {(["PAID", "UNPAID"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-surface duration-150 ${
                  kind === k
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-slate-400 hover:border-gray-300"
                }`}>
                {k === "PAID" ? "Paid" : "Unpaid"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">Note (optional)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${leaveInput} resize-none`} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

const leaveInput =
  "min-w-0 w-full px-2.5 py-1.5 text-[13px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
