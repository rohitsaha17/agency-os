"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";

type Entry = {
  id: string;
  entityType: string;
  entityId: string;
  title: string | null;
  from: string | null;
  to: string;
  note: string | null;
  at: string;
  by: { id: string; name: string; avatarUrl: string | null } | null;
};

/**
 * Everything that has happened to this project.
 *
 * Read from status_history, which the product has been writing on every
 * transition since v2 and which nothing had ever read at project level. So
 * this is not a new record being started — it is the existing one, shown.
 *
 * Grouped by day, because "what happened on Tuesday" is the question people
 * actually bring to an audit trail; a flat list of two hundred timestamps is
 * technically complete and practically unreadable.
 */
export function ActivityTab({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/activity`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403
          ? "You do not have access to this project's history."
          : "Could not load the history.");
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setEntries(d.entries ?? []);
        setTruncated(!!d.truncated);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the history."); });
    return () => { alive = false; };
  }, [projectId]);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400 py-8 text-center">{error}</p>;
  }
  if (!entries) {
    return (
      <p className="text-sm text-gray-500 py-10 text-center flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading history…
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <History className="w-6 h-6 text-gray-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm text-gray-500">Nothing has been recorded on this project yet.</p>
      </div>
    );
  }

  const days = groupByDay(entries);

  return (
    <div className="space-y-6">
      {days.map(([day, rows]) => (
        <section key={day}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            {day}
          </h3>
          <ul className="border border-gray-200 dark:border-white/[0.07] rounded-xl overflow-hidden">
            {rows.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 border-gray-100 dark:border-white/[0.05]"
              >
                <span className="text-[11px] text-gray-400 tabular-nums w-14 flex-shrink-0 pt-0.5">
                  {time(e.at)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-gray-900">
                    <span className="font-medium">{e.by?.name ?? "The system"}</span>
                    {" "}
                    {phrase(e)}
                    {e.title && (
                      <>
                        {" "}
                        <span className="font-medium">{e.title}</span>
                      </>
                    )}
                  </p>
                  {e.note && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{e.note}</p>
                  )}
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-slate-400 flex-shrink-0">
                  {label(e.entityType)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {truncated && (
        <p className="text-[11px] text-gray-400 text-center">
          Showing the most recent 200 changes.
        </p>
      )}
    </div>
  );
}

/**
 * What the row says in words.
 *
 * "changed status from TODO to DONE" is the literal truth and reads like a
 * database. A person scanning for what went wrong wants a sentence.
 */
function phrase(e: Entry): string {
  if (!e.from) return `created`;
  return `moved ${e.from.toLowerCase().replace(/_/g, " ")} → ${e.to.toLowerCase().replace(/_/g, " ")} on`;
}

function label(entityType: string): string {
  if (entityType === "TASK") return "Task";
  if (entityType === "PROJECT") return "Project";
  if (entityType === "CONTENT_ITEM") return "Plan";
  return entityType.toLowerCase();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Groups in order, keeping the newest-first sort the server sent. */
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
  const ampm = h < 12 ? "am" : "pm";
  return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
}
