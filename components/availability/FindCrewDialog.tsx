"use client";

/**
 * "Who can shoot on Thursday?" — asked directly, for once.
 *
 * The grid answers it by eye. This answers it by name, ranked, with the
 * unavailable people listed underneath so you can see WHY the obvious choice
 * is not available rather than wondering where he went.
 *
 * It calls /api/availability/day, which has answered exactly this question
 * since the assignee picker was built — one request for the whole team, with
 * blocked and load together, because they are two halves of one decision.
 *
 * Assigning goes through POST /api/tasks like everything else, so the
 * assignment guard, the role rules and the routing all still apply. If somebody
 * became unavailable between the search and the click, the server refuses with
 * a 409 and the message says who and why. That refusal is the feature working,
 * and it is shown rather than swallowed.
 *
 * Load is never called a limit. A photographer with two shoots is offered with
 * "high workload" beside their name, not withheld — whether a third is too
 * many is a judgement this screen has no business making.
 */

import { useCallback, useEffect, useState } from "react";
import { Search, Users, CheckCircle2, ChevronDown, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { KIND_SHORT, loadLevel, type UnavailabilityKind } from "@/lib/availability";
import { Avatar } from "./chrome";

interface DayPerson {
  id: string;
  name: string;
  craft: string | null;
  blocked: { kind: UnavailabilityKind; reason: string } | null;
  load: number;
  on: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The date the grid is looking at, so the search starts where you are. */
  defaultDate: string;
  crafts: string[];
  onAssigned: () => void;
}

export function FindCrewDialog({ open, onClose, defaultDate, crafts, onAssigned }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [craft, setCraft] = useState("");
  const [projectId, setProjectId] = useState("");
  const [needed, setNeeded] = useState(1);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [result, setResult] = useState<DayPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // The composer, opened by one person's Assign button.
  const [assignTo, setAssignTo] = useState<DayPerson | null>(null);
  const [title, setTitle] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    setResult(null);
    setError(null);
    setAssignTo(null);
    setAssignError(null);
  }, [open, defaultDate]);

  useEffect(() => {
    if (!open || projects.length) return;
    fetch("/api/projects?status=ACTIVE&pageSize=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows = Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []);
        setProjects(Array.isArray(rows) ? rows.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : []);
      })
      .catch(() => { /* the search still works without a project */ });
  }, [open, projects.length]);

  const search = useCallback(async () => {
    setSearching(true);
    setError(null);
    setAssignTo(null);
    try {
      const res = await fetch(`/api/availability/day?date=${date}`);
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Finding crew is part of planning access, which this account doesn't have."
            : `The server returned ${res.status}.`,
        );
      }
      const d = await res.json();
      setResult(Array.isArray(d.people) ? d.people : []);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }, [date]);

  const matching = (result ?? []).filter((p) => !craft || p.craft === craft);
  // Least loaded first: the person with nothing on is the one to offer.
  const free = matching.filter((p) => !p.blocked).sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
  const out = matching.filter((p) => p.blocked);

  async function assign() {
    if (!assignTo) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: date,
          projectId: projectId || undefined,
          assigneeIds: [assignTo.id],
          // The time is a note, not a filter — the app schedules by day, and
          // a field that silently failed to narrow anything would be worse
          // than one that is honest about what it does.
          ...(time.trim() ? { description: `Time: ${time.trim()}` } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error?.message ?? "Could not assign that");
      setAssignTo(null);
      setTitle("");
      onAssigned();
      search();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Find available crew" width="max-w-2xl">
      <div className="space-y-4">
        {/* The question */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Date">
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Time" hint="optional">
            <input
              value={time} onChange={(e) => setTime(e.target.value)}
              placeholder="2–6 PM"
              className={INPUT}
            />
          </Field>
          <Field label="Role">
            <Select
              value={craft} onChange={setCraft} allowEmpty placeholder="Any role"
              options={crafts.map((c) => ({ value: c, label: c }))}
              className="w-full"
            />
          </Field>
          <Field label="People needed">
            <input
              type="number" min={1} max={20} value={needed}
              onChange={(e) => setNeeded(Math.max(1, Number(e.target.value) || 1))}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Project" hint="optional">
            <Select
              value={projectId} onChange={setProjectId} allowEmpty placeholder="No project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              className="w-full"
            />
          </Field>
          <Button onClick={search} loading={searching} icon={<Search className="w-3.5 h-3.5" />}>
            Find crew
          </Button>
        </div>

        <p className="text-[11px] text-gray-400">
          The app schedules by day, so a time here travels with the task as a note
          rather than narrowing the search.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-4 border-t border-gray-100 dark:border-white/[0.06] pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Available crew ({free.length})
              </h3>
              <span className={`text-[11px] tabular-nums ${free.length >= needed ? "text-gray-400" : "text-amber-600 dark:text-amber-400 font-medium"}`}>
                need {needed}
                {free.length < needed && ` · ${free.length} free`}
              </span>
            </div>

            {free.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
                Nobody{craft ? ` in ${craft}` : ""} is free on this day.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {free.map((p) => {
                  const level = loadLevel(p.load);
                  return (
                    <li key={p.id} className="rounded-xl border border-gray-200 dark:border-white/[0.08]">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <Avatar name={p.name} url={null} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                            {p.craft ?? "Team"}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" aria-hidden /> Available
                          </p>
                          <p className={`text-[11px] ${level === "heavy" || level === "busy" ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                            {p.load === 0 ? "No conflicts" : `${p.load} job${p.load === 1 ? "" : "s"} today`}
                            {level === "heavy" && " · high workload"}
                          </p>
                        </div>
                        {p.load > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                            aria-expanded={expanded === p.id}
                            className="text-[11px] text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 inline-flex items-center gap-0.5 flex-shrink-0"
                          >
                            Schedule
                            <ChevronDown className={`w-3 h-3 transition-transform ${expanded === p.id ? "rotate-180" : ""}`} aria-hidden />
                          </button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => { setAssignTo(p); setAssignError(null); }}>
                          Assign
                        </Button>
                      </div>

                      {expanded === p.id && (
                        <ul className="px-3 pb-2.5 space-y-1">
                          {p.on.length === 0 ? (
                            <li className="text-[11px] text-gray-400">Nothing due on them.</li>
                          ) : p.on.map((t, i) => (
                            <li key={`${t}-${i}`} className="text-[11px] text-gray-600 dark:text-slate-300 pl-9 truncate">• {t}</li>
                          ))}
                        </ul>
                      )}

                      {assignTo?.id === p.id && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-white/[0.06] space-y-2">
                          <label htmlFor="crew-task" className="block text-[11px] font-medium text-gray-500 dark:text-slate-400">
                            What is the task?
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="crew-task"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Brand shoot — Ghar Furniture"
                              className={INPUT}
                              autoFocus
                            />
                            <Button
                              size="sm" onClick={assign} loading={assigning}
                              disabled={!title.trim()}
                              icon={<Send className="w-3.5 h-3.5" />}
                            >
                              Assign
                            </Button>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Creates a task due {date}{projectId ? " on the selected project" : ""}, assigned to {p.name.split(" ")[0]}.
                          </p>
                          {assignError && (
                            <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{assignError}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {out.length > 0 && (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Not available ({out.length})
                </h3>
                <ul className="space-y-1">
                  {out.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] opacity-90">
                      <Avatar name={p.name} url={null} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{p.craft ?? "Team"}</p>
                      </div>
                      <div className="text-right min-w-0">
                        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          {KIND_SHORT[p.blocked!.kind] ?? "Unavailable"}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate max-w-[16rem]">{p.blocked!.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {!result && !error && !searching && (
          <div className="py-6 text-center">
            <Users className="w-7 h-7 text-gray-200 dark:text-slate-700 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Pick a day and press Find crew.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

const INPUT =
  "w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-white/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
        {label}
        {hint && <span className="text-gray-400 font-normal"> ({hint})</span>}
      </label>
      {children}
    </div>
  );
}
