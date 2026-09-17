"use client";

/**
 * "I'm in." — the whole attendance feature, from the person's side.
 *
 * Deliberately one button and no clock. The agency doesn't pay by the hour,
 * so there is nothing to time: this records that today happened, which is
 * what the month review and the "who can take a shoot today" board both
 * need. Adding a check-out would invite somebody to start reading durations
 * off it, and then the number would have to be right.
 *
 * Once you've checked in it stops being a button and becomes a statement,
 * because there is nothing else to do here today.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Plane } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Me {
  state: "IN" | "ON_LEAVE" | "UNKNOWN";
  checkedInAt: string | null;
}

function shortTime(iso: string, timezone?: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

export function CheckInCard({ timezone }: { timezone?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<{ in: number; onLeave: number } | null>(null);
  const [seesTeam, setSeesTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hr/today");
      if (!res.ok) return;
      const d = await res.json();
      setMe(d.me ?? null);
      setSeesTeam(!!d.seesTeam);
      setSummary(d.summary ?? null);
    } catch { /* the button still works; it just won't know the count */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const checkIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Couldn't record that");
      }
      const d = await res.json();
      setMe({ state: "IN", checkedInAt: d.checkedInAt });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Nothing loaded yet — no skeleton, because an empty card that becomes a
  // button is less jarring than a shimmer that becomes a button.
  if (!me) return null;

  if (me.state === "ON_LEAVE") {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Icon tone="sky"><Plane className="w-4 h-4" /></Icon>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">You&rsquo;re on leave today</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Approved — nothing to do here.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (me.state === "IN") {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Icon tone="emerald"><CheckCircle2 className="w-4 h-4" /></Icon>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              You&rsquo;re in{me.checkedInAt ? ` since ${shortTime(me.checkedInAt, timezone)}` : ""}
            </p>
            {seesTeam && summary && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {summary.in} in today{summary.onLeave > 0 ? ` · ${summary.onLeave} on leave` : ""}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Icon tone="gray"><Clock className="w-4 h-4" /></Icon>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Start your day</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            {error ?? "Check in so the team knows you're available."}
          </p>
        </div>
        <Button size="sm" onClick={checkIn} loading={busy}>Check in</Button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/[0.08] rounded-xl px-4 py-3">
      {children}
    </div>
  );
}

function Icon({ tone, children }: { tone: "emerald" | "sky" | "gray"; children: React.ReactNode }) {
  const tones = {
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400",
    gray: "bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-slate-400",
  };
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
      {children}
    </div>
  );
}
