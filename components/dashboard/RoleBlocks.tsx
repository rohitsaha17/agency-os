"use client";

/**
 * v3 Phase 8 — the blocks each role actually needs (docs/V3_CONTEXT.md §8).
 *
 * One component, capability-driven blocks, so a junior lands on their work
 * and a manager lands on the money without either seeing a page full of
 * things they can't use. The API decides which blocks exist; this renders
 * whichever came back.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  ClipboardCheck, CalendarClock,
  IndianRupee, Users, ChevronRight,
} from "lucide-react";
import { formatMoney } from "@/lib/money";

interface Payload {
  blocks: { myWork: boolean; review: boolean; planning: boolean; money: boolean; team: boolean };
  myWork: {
    open: number;
    overdue: { id: string; title: string; dueDate: string | null; kind: string; client: { name: string } | null }[];
    changesRequested: { id: string; title: string; revision: number; client: { name: string } | null }[];
    postDue: { id: string; title: string; dueDate: string | null; client: { name: string } | null }[];
    /** True counts (not derived from the capped arrays above) for the stat card. */
    stats: {
      open: number;
      overdue: number;
      dueToday: number;
      dueThisWeek: number;
      changesRequested: number;
      completedThisWeek: number;
    };
  };
  review: { awaiting: number };
  planning: {
    projects: {
      id: string; name: string; client: string; cycleLabel: string; endDate: string;
      quota: number; planned: number; posted: number; unplanned: number;
    }[];
    closingSoon: { id: string; label: string; endDate: string; project: { id: string; name: string; client: { name: string } } }[];
  };
  money: {
    invoiced: number; collected: number; outstanding: number;
    expenses: number; needsPricing: number; overdueAcrossOrg: number;
  } | null;
  team: { id: string; name: string; jobTitle: string | null; open: number; overdue: number; inReview: number }[];
}

/**
 * The role blocks' card.
 *
 * `urgent` lights it: a warmer border and a stronger wash, and a count beside
 * the title. The block that wants doing should not look the same as the one
 * that is only telling you something — on a page of identical white cards
 * there was nothing to draw the eye to the one thing overdue.
 *
 * Built from indigo utilities, which the Gloo theme turns orange; see
 * components/dashboard/kit.
 */
function Card({ title, action, children, icon, urgent, count }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  urgent?: boolean;
  count?: number;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${
      urgent
        ? "border-indigo-300 dark:border-indigo-500/40"
        : "border-gray-200 dark:border-white/[0.07]"
    } bg-white dark:bg-slate-900`}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
          urgent
            ? "from-indigo-500/[0.16] via-indigo-500/[0.04] to-transparent"
            : "from-indigo-500/[0.06] via-transparent to-transparent"
        }`}
      />
      <div className="relative p-4">
        <div className="flex items-center gap-2.5 mb-3">
          {icon && (
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
            >
              {icon}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
          {typeof count === "number" && count > 0 && (
            <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              {count}
            </span>
          )}
          <span className="ml-auto flex-shrink-0">{action}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function days(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Stat-tile tones. Neutral by default; a tile only takes colour when its
 *  number is worth reacting to (overdue, changes) or celebrating (done). */
const TONE: Record<string, string> = {
  neutral: "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 dark:bg-white/[0.04] dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.08]",
  red:     "bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300",
  amber:   "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300",
  indigo:  "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-200",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300",
};

/** One number in the at-a-glance card. The whole tile is the link. */
function Stat({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  return (
    <Link href={href} className={`rounded-lg border px-2.5 py-2 transition-colors ${TONE[tone] ?? TONE.neutral}`}>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-medium mt-1 opacity-70 truncate">{label}</p>
    </Link>
  );
}

export function RoleBlocks({ currency = "USD" }: { currency?: string }) {
  const [d, setD] = useState<Payload | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/v3")
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => setD(null));
  }, []);

  if (!d) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {[1, 2].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const { myWork, planning, money, team } = d;
  const s = myWork.stats;
  // The things that actually want reacting to — the count badge and the warm
  // border track these, not the plain "open" total.
  const attention = s.overdue + s.changesRequested;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

      {/* ── Everyone: your work at a glance ──
          Numbers, not another copy of the task list. The full list is the
          "My Tasks" card below; this one is the summary you scan first. */}
      <Card
        title="Your work at a glance"
        icon={<Bell className="w-4 h-4" />}
        urgent={attention > 0}
        count={attention}
      >
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Open"       value={s.open}             tone="neutral"                                   href="/tasks" />
          <Stat label="Overdue"    value={s.overdue}          tone={s.overdue > 0 ? "red" : "neutral"}         href="/tasks" />
          <Stat label="Due today"  value={s.dueToday}         tone={s.dueToday > 0 ? "indigo" : "neutral"}     href="/my-calendar" />
          <Stat label="This week"  value={s.dueThisWeek}      tone="neutral"                                   href="/my-calendar" />
          <Stat label="Changes"    value={s.changesRequested} tone={s.changesRequested > 0 ? "amber" : "neutral"} href="/tasks" />
          <Stat label="Done · 7d"  value={s.completedThisWeek} tone={s.completedThisWeek > 0 ? "emerald" : "neutral"} href="/tasks" />
        </div>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3">
          {attention > 0
            ? `${attention} ${attention === 1 ? "thing needs" : "things need"} action`
            : "All caught up — nothing overdue or waiting."}
        </p>
      </Card>

      {/* ── Reviewers: the approvals queue ── */}
      {d.blocks.review && (
        <Card
          title="Waiting on your review"
          action={
            <Link href="/tasks?tab=approvals" className="text-xs text-indigo-600 hover:underline">
              Open inbox
            </Link>
          }
        >
          {d.review.awaiting === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nothing submitted right now.</p>
          ) : (
            <Link href="/tasks?tab=approvals"
              className="flex items-center gap-3 px-3 py-3 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
              <ClipboardCheck className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-indigo-900">
                  {d.review.awaiting} piece{d.review.awaiting === 1 ? "" : "s"} of work submitted
                </p>
                <p className="text-xs text-indigo-700">Approve it or send it back for another round</p>
              </div>
              <ChevronRight className="w-4 h-4 text-indigo-400 ml-auto flex-shrink-0" />
            </Link>
          )}
        </Card>
      )}

      {/* ── Planners: how each cycle is going ── */}
      {d.blocks.planning && (
        <Card title="My projects this cycle">
          {planning.projects.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No open cycles.</p>
          ) : (
            <div className="space-y-3">
              {planning.projects.slice(0, 5).map((p) => {
                const pct = p.quota > 0 ? Math.min(100, (p.posted / p.quota) * 100) : 0;
                return (
                  <Link key={p.id} href={`/projects/${p.id}?tab=plan`} className="block group">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate group-hover:text-indigo-700">
                        {p.name}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0 ml-2">
                        {p.posted}/{p.quota || "—"} posted
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-colors" style={{ width: `${pct}%` }} />
                    </div>
                    {p.unplanned > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        {p.unplanned} deliverable{p.unplanned === 1 ? "" : "s"} not planned yet
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {planning.closingSoon.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
              {planning.closingSoon.map((c) => (
                <Link key={c.id} href={`/projects/${c.project.id}?tab=plan`}
                  className="flex items-center gap-2 text-xs text-gray-600 hover:text-indigo-700">
                  <CalendarClock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="truncate">{c.project.name} · {c.label}</span>
                  <span className="text-gray-400 ml-auto flex-shrink-0">
                    closes in {Math.max(0, days(c.endDate))}d
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Money: admin and manager only ── */}
      {d.blocks.money && money && (
        <Card
          title="Money"
          action={<Link href="/invoices" className="text-xs text-indigo-600 hover:underline">Invoices</Link>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Invoiced",    value: formatMoney(money.invoiced, currency) },
              { label: "Collected",   value: formatMoney(money.collected, currency) },
              { label: "Outstanding", value: formatMoney(money.outstanding, currency) },
              { label: "Expenses",    value: formatMoney(money.expenses, currency) },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-[11px] text-gray-500">{s.label}</p>
                <p className="text-sm font-semibold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
          {money.needsPricing > 0 && (
            <Link href="/invoices"
              className="flex items-center gap-2 mt-3 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
              <IndianRupee className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-xs text-amber-900">
                {money.needsPricing} item{money.needsPricing === 1 ? "" : "s"} waiting on a price
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-400 ml-auto" />
            </Link>
          )}
        </Card>
      )}

      {/* ── Team workload ── */}
      {d.blocks.team && team.length > 0 && (
        <Card title="Team workload">
          <div className="space-y-1.5">
            {team.slice(0, 6).map((u) => (
              <div key={u.id} className="flex items-center gap-2 text-xs">
                <Users className="w-3 h-3 text-gray-300 flex-shrink-0" />
                <span className="text-gray-700 truncate flex-1">
                  {u.name}
                  {u.jobTitle && <span className="text-gray-400"> · {u.jobTitle}</span>}
                </span>
                <span className="text-gray-500 tabular-nums flex-shrink-0">{u.open} open</span>
                {u.inReview > 0 && (
                  <span className="text-indigo-600 tabular-nums flex-shrink-0">{u.inReview} in review</span>
                )}
                {u.overdue > 0 && (
                  <span className="text-red-500 font-medium tabular-nums flex-shrink-0">{u.overdue} late</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
