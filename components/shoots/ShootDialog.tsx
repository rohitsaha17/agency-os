"use client";

/**
 * "I'm going on a shoot on the 4th, 9 to 1, and Harsh is coming" is one thought,
 * so it is one dialog.
 *
 * You are pre-selected on it — the common case is booking yourself — but you can
 * add anyone else on the team, or take yourself off and book it purely for
 * others. The server (POST /api/shoots) is the enforcement; this is the form
 * that makes the one thought easy to record.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock, Search, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  MAX_TITLE, MAX_LOCATION, validateTitle, validateTimes, initials,
} from "@/lib/shoots";

interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: { name: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  meId: string;
  /** Prefill the date (e.g. the day the user clicked in the grid). */
  initialDate?: string;
  onSaved: () => void;
}

export function ShootDialog({ open, onClose, meId, initialDate, onSaved }: Props) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("13:00");
  const [location, setLocation] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peopleQuery, setPeopleQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open (not close) so a failed save keeps what was typed.
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setTitle("");
    setDate(initialDate ?? today);
    setFrom("09:00");
    setTo("13:00");
    setLocation("");
    setSelected(new Set(meId ? [meId] : []));
    setPeopleQuery("");
    setError(null);
  }, [open, initialDate, meId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: TeamMember[]) => { if (alive) setTeam(rows); })
      .catch(() => { /* the picker just shows nobody; the field is still usable */ });
    return () => { alive = false; };
  }, [open]);

  const titleOk = validateTitle(title).ok;
  const timeCheck = validateTimes(from, to);
  const timesOk = timeCheck.ok;
  const timeErr = timeCheck.ok ? null : timeCheck.error;
  const peopleOk = selected.size > 0;
  const canSave = titleOk && timesOk && peopleOk && !!date;

  const filteredTeam = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    return team
      .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.jobTitle?.name ?? "").toLowerCase().includes(q))
      // Selected people float to the top so the chips and the list agree.
      .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.name.localeCompare(b.name));
  }, [team, peopleQuery, selected]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/shoots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          from,
          to,
          location: location.trim() || undefined,
          userIds: [...selected],
        }),
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
      title="Add a shoot"
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>
            {selected.size > 1 ? `Book for ${selected.size} people` : "Book the shoot"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="shoot-title" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            What&rsquo;s the shoot?
          </label>
          <input
            id="shoot-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="e.g. Nykaa product shoot"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div>
          <label htmlFor="shoot-date" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Date</label>
          <input
            id="shoot-date"
            type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="shoot-from" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">From</label>
            <input
              id="shoot-from"
              type="time" value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                // Keep the end after the start — a backwards range is a typo.
                if (to <= e.target.value) {
                  const [h, m] = e.target.value.split(":").map(Number);
                  const end = Math.min(23 * 60 + 59, (h ?? 0) * 60 + (m ?? 0) + 60);
                  setTo(`${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`);
                }
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div>
            <label htmlFor="shoot-to" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">To</label>
            <input
              id="shoot-to"
              type="time" value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>
        {timeErr && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            {timeErr}
          </p>
        )}

        <div>
          <label htmlFor="shoot-location" className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            Location <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="shoot-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={MAX_LOCATION}
            placeholder="e.g. Studio 4, Andheri"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        {/* Who's going */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400">
              Who&rsquo;s going
            </label>
            <span className="text-[11px] text-gray-400">{selected.size} selected</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden />
            <input
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              placeholder="Search the team…"
              aria-label="Search the team"
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/[0.1] divide-y divide-gray-100 dark:divide-white/[0.06]">
            {filteredTeam.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-gray-400">No one matches that.</p>
            ) : (
              filteredTeam.map((m) => {
                const on = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold shrink-0 ${
                        on
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-slate-300"
                      }`}
                      aria-hidden
                    >
                      {on ? <Check className="w-3.5 h-3.5" /> : initials(m.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-gray-800 dark:text-slate-100 truncate">
                        {m.name}{m.id === meId ? " (you)" : ""}
                      </span>
                      {m.jobTitle?.name && (
                        <span className="block text-[11px] text-gray-400 truncate">{m.jobTitle.name}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {!peopleOk && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Add at least one person.</p>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Nobody on the shoot can be given work due that day — this is not leave,
            it just keeps the planner from double-booking them.
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
