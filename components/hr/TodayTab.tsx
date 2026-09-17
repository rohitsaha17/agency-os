"use client";

/**
 * Who is in today.
 *
 * Grouped by state rather than listed alphabetically, because the question
 * this screen answers is "who can take this shoot" — and that is a question
 * about the IN group. A flat list makes you read every row to find out.
 *
 * The third group is "Not checked in", not "Absent". At half past nine that
 * is somebody on a train, and a board that calls them absent is lying with
 * confidence. The wording is the honest version of what the data knows.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plane, CircleDashed, ShieldCheck } from "lucide-react";
import { LoadError } from "@/components/ui/LoadError";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  craft: string | null;
  state: "IN" | "ON_LEAVE" | "UNKNOWN";
  checkedInAt: string | null;
  recordedByAdmin: boolean;
  note: string | null;
  leaveKind: "PAID" | "UNPAID" | null;
}

export function TodayTab({ query }: { query: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hr/today");
      if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to the team board." : `The server returned ${res.status}.`);
      const d = await res.json();
      setPeople(d.people ?? []);
      setDate(d.date ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your connection and try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <LoadError message="Couldn't load who's in" detail={error} onRetry={load} />;
  if (!people) return <Skeleton />;

  const q = query.trim().toLowerCase();
  const match = (p: Person) =>
    !q || p.name.toLowerCase().includes(q) || (p.craft ?? "").toLowerCase().includes(q);

  const groups = [
    { key: "IN" as const, label: "In today", icon: CheckCircle2, tone: "emerald" as const },
    { key: "ON_LEAVE" as const, label: "On leave", icon: Plane, tone: "sky" as const },
    { key: "UNKNOWN" as const, label: "Not checked in", icon: CircleDashed, tone: "gray" as const },
  ];

  return (
    <div className="space-y-5">
      {date && (
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
          })}
        </p>
      )}

      {groups.map((g) => {
        const rows = people.filter((p) => p.state === g.key && match(p));
        if (!rows.length) return null;
        const Icon = g.icon;
        return (
          <section key={g.key}>
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-2">
              <Icon className={`w-4 h-4 ${
                g.tone === "emerald" ? "text-emerald-500"
                  : g.tone === "sky" ? "text-sky-500" : "text-gray-400"}`} />
              {g.label}
              <span className="text-gray-400 font-normal">{rows.length}</span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((p) => (
                <div key={p.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl">
                  <Avatar name={p.name} url={p.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-slate-100 truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                      {p.state === "IN" && p.checkedInAt
                        ? new Date(p.checkedInAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        : p.state === "ON_LEAVE"
                          ? p.leaveKind === "UNPAID" ? "Unpaid leave" : "Paid leave"
                          : p.craft ?? "—"}
                    </p>
                  </div>
                  {p.recordedByAdmin && (
                    // Says who recorded it, so a row added on somebody's
                    // behalf never passes for them checking themselves in.
                    <span title="Recorded by an admin">
                      <ShieldCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {people.filter(match).length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
          {q ? "Nobody by that name." : "Nobody on the team yet."}
        </p>
      )}
    </div>
  );
}

export function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
      ))}
    </div>
  );
}
