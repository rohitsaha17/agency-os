"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, Search, Loader2, X } from "lucide-react";
import { RequireCapability } from "@/components/layout/RequireCapability";
import { Select } from "@/components/ui/Select";

type Entry = {
  id: string;
  entityType: string;
  entityId: string;
  title: string | null;
  projectId: string | null;
  from: string | null;
  to: string;
  note: string | null;
  at: string;
  by: { id: string; name: string } | null;
};

const TYPES = [
  { value: "", label: "Everything" },
  { value: "TASK", label: "Tasks" },
  { value: "PROJECT", label: "Projects" },
  { value: "CONTENT_ITEM", label: "Plans" },
];

/**
 * The activity log.
 *
 * Reads status_history, which this product has been writing on every
 * transition since v2 and which nothing had ever shown across the whole
 * workspace. So nothing starts recording today — the record was already
 * there, and this is the first way to look at it.
 *
 * Built around the question it exists to answer: somebody did something and
 * you need to find out who, or you know who and need to find out what. So the
 * filters are a person, a kind of thing, a date range and a search, and they
 * combine — "everything Rana did to tasks last week" is three of them at once
 * rather than a report somebody has to ask for.
 */
export default function ActivityPage() {
  // The shared guard, not a hand-rolled can() check: it shows the same
  // refusal every other gated page shows, and scripts/check-page-guards
  // asserts that a nav entry with a capability has one of these behind it.
  return (
    <RequireCapability capability="activity.view" what="Activity">
      <ActivityLog />
    </RequireCapability>
  );
}

function ActivityLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** Applied on a beat, so typing does not fire a request per keystroke. */
  const [appliedQ, setAppliedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPeople(Array.isArray(d) ? d.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })) : []))
      .catch(() => { /* the filter simply offers nobody */ });
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (userId) p.set("userId", userId);
    if (entityType) p.set("entityType", entityType);
    if (appliedQ) p.set("q", appliedQ);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [userId, entityType, appliedQ, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/activity?${params}`);
      if (!res.ok) throw new Error(res.status === 403
        ? "You do not have access to the activity log."
        : "Could not load the activity log.");
      const d = await res.json();
      setEntries(d.entries ?? []);
      setCursor(d.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the activity log.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/activity?${params}&cursor=${cursor}`);
      if (res.ok) {
        const d = await res.json();
        setEntries((prev) => [...prev, ...(d.entries ?? [])]);
        setCursor(d.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = !!(userId || entityType || appliedQ || from || to);
  const clear = () => { setUserId(""); setEntityType(""); setQ(""); setAppliedQ(""); setFrom(""); setTo(""); };

  return (
    <div className="flex-1 overflow-auto">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Activity</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every change recorded in this workspace, newest first.
        </p>
      </div>

      {/* Filters. They combine, because the question is usually more than one. */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by what changed, or a note"
              aria-label="Search activity"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <Select
            value={userId}
            onChange={setUserId}
            size="sm"
            className="w-full sm:w-44"
            options={[{ value: "", label: "Everyone" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            value={entityType}
            onChange={setEntityType}
            size="sm"
            className="w-full sm:w-36"
            options={TYPES}
          />
          <input
            type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From"
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To"
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {filtered && (
            <button
              onClick={clear}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 rounded-lg"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-5">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-10 text-center">{error}</p>
        ) : loading ? (
          <p className="text-sm text-gray-500 py-12 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
          </p>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-6 h-6 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-gray-500">
              {filtered ? "Nothing matches those filters." : "Nothing has been recorded yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {groupByDay(entries).map(([day, rows]) => (
                <section key={day}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{day}</h2>
                  <ul className="border border-gray-200 dark:border-white/[0.07] rounded-xl overflow-hidden">
                    {rows.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-white/[0.05]">
                        <span className="text-[11px] text-gray-400 tabular-nums w-14 flex-shrink-0 pt-0.5">{time(e.at)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-gray-900">
                            <span className="font-medium">{e.by?.name ?? "The system"}</span>{" "}
                            {phrase(e)}{" "}
                            {e.title && (
                              e.projectId
                                ? <Link href={`/projects/${e.projectId}`} className="font-medium text-indigo-600 hover:underline">{e.title}</Link>
                                : <span className="font-medium">{e.title}</span>
                            )}
                          </p>
                          {e.note && <p className="text-[11px] text-gray-400 mt-0.5">{e.note}</p>}
                        </div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-slate-400 flex-shrink-0">
                          {label(e.entityType)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {cursor && (
              <div className="pt-5 text-center">
                <button
                  onClick={more}
                  disabled={loadingMore}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-white/[0.05] disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function phrase(e: Entry): string {
  if (!e.from) return "created";
  return `moved ${e.from.toLowerCase().replace(/_/g, " ")} → ${e.to.toLowerCase().replace(/_/g, " ")} on`;
}

function label(t: string): string {
  if (t === "TASK") return "Task";
  if (t === "PROJECT") return "Project";
  if (t === "CONTENT_ITEM") return "Plan";
  return t.toLowerCase();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function groupByDay(entries: Entry[]): [string, Entry[]][] {
  const out: [string, Entry[]][] = [];
  for (const e of entries) {
    const d = new Date(e.at);
    const key = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const last = out[out.length - 1];
    if (last && last[0] === key) last[1].push(e);
    else out.push([key, [e]]);
  }
  return out;
}

function time(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "am" : "pm"}`;
}
