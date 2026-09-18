"use client";

/**
 * "I'm away the 10th to the 14th" is one thought, so it is one dialog.
 *
 * The store is a row per day — that is what makes the check on every
 * assignment a lookup rather than an overlap query — but nobody should have to
 * know that. POST /api/availability has always taken a range and written the
 * rows in a single transaction; what was missing was a form that said so. The
 * button counts the days out loud ("Block 5 days") so the range is confirmed
 * before it is committed, not discovered afterwards.
 *
 * It does not offer LEAVE as a type. Leave goes through a request somebody
 * approves; letting anyone write a day labelled "On leave" here would make the
 * route with an approval on it the slow one nobody has to use.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarRange } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  KIND_LABEL, MAX_REASON, MIN_REASON, expandRange, type UnavailabilityKind,
} from "@/lib/availability";

/** Everything except LEAVE — that route has an approver on it. */
const KIND_OPTIONS = (["SHOOT", "SICK", "OTHER_CLIENT", "OTHER"] as UnavailabilityKind[])
  .map((k) => ({ value: k, label: KIND_LABEL[k] }));

export interface BlockTarget {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Who this may be recorded for. One entry when it can only be yourself. */
  people: BlockTarget[];
  meId: string;
  initial: { userId?: string; from?: string; to?: string } | null;
  onSaved: () => void;
}

export function BlockDaysDialog({ open, onClose, people, meId, initial, onSaved }: Props) {
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<UnavailabilityKind>("SHOOT");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open rather than on close, so a failed save keeps what was typed
  // and the person can fix the one field that was wrong.
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setUserId(initial?.userId ?? meId);
    setFrom(initial?.from ?? today);
    setTo(initial?.to ?? initial?.from ?? today);
    setKind("SHOOT");
    setReason("");
    setError(null);
  }, [open, initial, meId]);

  const days = useMemo(
    () => (from && to ? expandRange(from, to).length : 0),
    [from, to],
  );
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;
  const rangeOk = days > 0;

  const who = people.find((p) => p.id === userId);
  const forSomebodyElse = !!userId && userId !== meId;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, from, to, kind, reason: trimmed }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Could not save that");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Block days"
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!rangeOk || !reasonOk}>
            {days > 1 ? `Block ${days} days` : "Block the day"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {people.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Person</label>
            <Select
              value={userId}
              onChange={setUserId}
              className="w-full"
              options={people.map((p) => ({
                value: p.id,
                label: p.id === meId ? `${p.name} (you)` : p.name,
              }))}
            />
            {forSomebodyElse && (
              <p className="text-[11px] text-gray-400 mt-1">
                Recording it for {who?.name.split(" ")[0] ?? "them"} — for when they can&rsquo;t do it themselves.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">From</label>
            <input
              type="date" value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                // A range that ends before it starts is a typo, not a choice.
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">To</label>
            <input
              type="date" value={to} min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        {rangeOk && (
          <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
            <CalendarRange className="w-3.5 h-3.5 text-gray-400" aria-hidden />
            {days === 1 ? "One day" : `${days} days`}, {from} to {to}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Type</label>
          <Select value={kind} onChange={(v) => setKind(v as UnavailabilityKind)} options={KIND_OPTIONS} className="w-full" />
        </div>

        <div>
          <label htmlFor="block-reason" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            Reason
          </label>
          <input
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON}
            placeholder="Shooting for another client · family wedding · out of town"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Whoever plans your work sees this, so a few words is enough.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Nobody will be able to assign work due on these days. Work already
            assigned stays where it is — move it yourself if it needs moving.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
