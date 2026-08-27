"use client";

/**
 * Who is available, and when.
 *
 * Two audiences on one page, because they are the same question asked from
 * different ends. A photographer comes here to say "I'm on someone else's
 * shoot on the 4th". An SMM comes here to find out who can shoot on the 4th
 * before promising a client a date.
 *
 * Shoot crew are often freelancers: booked by other people, taking leave
 * without telling us, and physically unable to do three shoots in a day.
 * None of that was visible before, so it surfaced only when somebody said no
 * to work already promised.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarOff, Plus, Trash2, Users, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { MONTH_NAMES } from "@/components/calendar/MonthGrid";
import {
  KIND_LABEL, MAX_REASON, MIN_REASON, dayString,
  type UnavailabilityKind,
} from "@/lib/availability";

interface Block {
  id: string;
  userId: string;
  date: string;
  kind: UnavailabilityKind;
  reason: string;
  user?: { id: string; name: string; avatarUrl?: string | null; jobTitle?: { name: string } | null } | null;
  createdBy?: { id: string; name: string } | null;
}

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as UnavailabilityKind[])
  .map((k) => ({ value: k, label: KIND_LABEL[k] }));

const KIND_TONE: Record<string, string> = {
  SHOOT: "bg-violet-50 text-violet-700 border-violet-200",
  LEAVE: "bg-sky-50 text-sky-700 border-sky-200",
  SICK: "bg-rose-50 text-rose-700 border-rose-200",
  OTHER_CLIENT: "bg-amber-50 text-amber-700 border-amber-200",
  OTHER: "bg-gray-100 text-gray-600 border-gray-200",
};

function prettyDay(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export default function AvailabilityPage() {
  const { user: me } = useCurrentUser();
  const confirm = useConfirm();
  const plansWork = can(me, "content.plan");
  const managesUsers = can(me, "users.manage");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [forUserId, setForUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<UnavailabilityKind>("SHOOT");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  // A generous window either side, so a block that starts late in the month
  // and runs into the next one is still visible from both.
  const range = useMemo(() => {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return { from: dayString(start), to: dayString(end) };
  }, [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?from=${range.from}&to=${range.to}`);
      if (res.ok) setBlocks(await res.json());
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!managesUsers) return;
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) =>
      setPeople(Array.isArray(d) ? d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })) : []),
    ).catch(() => {});
  }, [managesUsers]);

  const mine = blocks.filter((b) => b.userId === me?.id);
  const theirs = blocks.filter((b) => b.userId !== me?.id);

  // Grouped by person: an SMM is asking "who is out", not "what happened on
  // the 9th", and a flat date list makes that a scanning exercise.
  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; craft: string | null; days: Block[] }>();
    for (const b of theirs) {
      const key = b.userId;
      if (!m.has(key)) {
        m.set(key, {
          name: b.user?.name ?? "Someone",
          craft: b.user?.jobTitle?.name ?? null,
          days: [],
        });
      }
      m.get(key)!.days.push(b);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [theirs]);

  function openAdd() {
    const today = dayString(new Date());
    setForUserId(me?.id ?? "");
    setFrom(today);
    setTo(today);
    setKind("SHOOT");
    setReason("");
    setError(null);
    setAdding(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: forUserId || undefined,
          from, to: to || from, kind, reason,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "Could not save that");
      toast.success(`${d.blocked} day${d.blocked === 1 ? "" : "s"} blocked`);
      setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: Block) {
    const ok = await confirm({
      title: "Free this day up?",
      message: `${prettyDay(b.date)} — "${b.reason}". People will be able to assign work on this day again.`,
      confirmLabel: "Free it up",
    });
    if (!ok) return;
    const res = await fetch(`/api/availability/${b.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Day freed up"); load(); }
    else toast.error("Could not remove that");
  }

  const reasonOk = reason.trim().length >= MIN_REASON && reason.trim().length <= MAX_REASON;

  return (
    <div className="flex flex-col min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Availability</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {plansWork
                ? "Days nobody can be given work. Check here before promising a shoot date."
                : "Days you can't take work. Nobody will be able to assign you anything on these."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); }}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >‹</button>
              <span className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                onClick={() => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); }}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >›</button>
            </div>
            <Button size="sm" onClick={openAdd} icon={<Plus className="w-3.5 h-3.5" />}>
              Block days
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-auto">
        {/* Yours */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Your unavailable days</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {MONTH_NAMES[month]} {year} · {mine.length} day{mine.length === 1 ? "" : "s"}
            </p>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : mine.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CalendarOff className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500">You&rsquo;re free all month.</p>
              <p className="text-xs text-gray-400 mt-1">
                Block a day and nobody will be able to assign you work on it.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mine.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-sm font-medium text-gray-900 w-32 flex-shrink-0">
                    {prettyDay(b.date)}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${KIND_TONE[b.kind] ?? KIND_TONE.OTHER}`}>
                    {KIND_LABEL[b.kind] ?? b.kind}
                  </span>
                  <span className="text-sm text-gray-600 flex-1 min-w-0 truncate">{b.reason}</span>
                  {b.createdBy && b.createdBy.id !== b.userId && (
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      set by {b.createdBy.name}
                    </span>
                  )}
                  <button
                    onClick={() => remove(b)}
                    aria-label="Free this day up"
                    className="p-2 text-gray-300 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Everybody else — planners only */}
        {plansWork && (
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">The team&rsquo;s diary</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Who can&rsquo;t take work this month, and why
                </p>
              </div>
            </div>
            {loading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : byPerson.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-500">Everyone is free this month.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Days people block will appear here as they add them.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {byPerson.map(([userId, p]) => (
                  <div key={userId} className="px-5 py-4">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                      {p.craft && <span className="text-xs text-gray-400">{p.craft}</span>}
                      <span className="text-xs text-gray-400 ml-auto">
                        {p.days.length} day{p.days.length === 1 ? "" : "s"} out
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.days.map((b) => (
                        <span
                          key={b.id}
                          title={b.reason}
                          className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${KIND_TONE[b.kind] ?? KIND_TONE.OTHER}`}
                        >
                          <span className="font-medium">{prettyDay(b.date)}</span>
                          <span className="opacity-70 truncate max-w-[16ch]">{b.reason}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Block days"
        width="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!from || !reasonOk}>Block them</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {managesUsers && people.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Who</label>
              <Select
                value={forUserId}
                onChange={setForUserId}
                className="w-full"
                options={people.map((p) => ({
                  value: p.id,
                  label: p.id === me?.id ? `${p.name} (you)` : p.name,
                }))}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Marking someone else out is for when they can&rsquo;t do it themselves.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">From</label>
              <input
                type="date" value={from}
                onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">To</label>
              <input
                type="date" value={to} min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">What is it</label>
            <Select value={kind} onChange={(v) => setKind(v as UnavailabilityKind)} options={KIND_OPTIONS} className="w-full" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REASON}
              placeholder="Shooting for another client · family wedding · out of town"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Whoever plans your work sees this, so a few words is enough.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Nobody will be able to assign work due on these days. Work already
              assigned stays where it is — move it yourself if it needs moving.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
