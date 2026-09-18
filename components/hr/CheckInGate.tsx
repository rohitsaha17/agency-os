"use client";

/**
 * The first thing in the day, and nothing else until it is done.
 *
 * A full cover rather than a card on the dashboard, because a card is
 * something you can scroll past — and a board that says "3 people in" while
 * eleven are working is worse than no board. One button, once a day, and then
 * it is gone until tomorrow.
 *
 * Deliberately not a route. Sending people to /check-in would mean a redirect
 * on every page, a URL to bookmark past, and a way back into the app while
 * still un-checked-in. This renders over whatever they asked for, so they
 * land where they were going the moment they press it.
 *
 * It covers the UI, not the API. Attendance is a working agreement, not a
 * permission — somebody with the URL of an endpoint could still call it, and
 * that is fine. This exists so the morning has an obvious first step, not to
 * defend anything.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function CheckInGate({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = name.trim().split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

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
      setDone(true);
      // The gate is decided on the server, so the page has to be re-rendered
      // to learn it is gone. refresh() keeps them on the URL they asked for
      // instead of bouncing them to the dashboard.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div
      // Above the sidebar and the app bar, both of which sit at z-40/50.
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-gray-50 dark:bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-heading"
    >
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-5">
          {done
            ? <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            : <Sun className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />}
        </div>

        <h1 id="checkin-heading" className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {greeting}{first ? `, ${first}` : ""}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          {done
            ? "You're in. Opening your work…"
            : "Check in to start your day. Your team sees who's available, so this is worth the one tap."}
        </p>

        {!done && (
          <Button
            size="lg"
            onClick={checkIn}
            loading={busy}
            className="mt-6 w-full justify-center"
          >
            Check in
          </Button>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}

        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-6">
          A new day opens at 6am.
        </p>
      </div>
    </div>
  );
}
