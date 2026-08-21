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
  AlertTriangle, RotateCcw, Send, ClipboardCheck, CalendarClock,
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

function Card({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function days(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
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
  const nothingUrgent =
    myWork.overdue.length === 0 &&
    myWork.changesRequested.length === 0 &&
    myWork.postDue.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

      {/* ── Everyone: what needs me ── */}
      <Card
        title="Needs you"
        action={<span className="text-xs text-gray-400">{myWork.open} open</span>}
      >
        {nothingUrgent ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Nothing overdue or waiting. Good place to be.
          </p>
        ) : (
          <div className="space-y-2">
            {myWork.changesRequested.map((t) => (
              <Link key={t.id} href={`/tasks?task=${t.id}`}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-900 flex-1 truncate">{t.title}</span>
                <span className="text-[10px] font-semibold text-amber-700 flex-shrink-0">
                  Round {t.revision}
                </span>
              </Link>
            ))}
            {myWork.overdue.slice(0, 4).map((t) => (
              <Link key={t.id} href={`/tasks?task=${t.id}`}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-900 flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-red-600 flex-shrink-0">
                  {t.dueDate ? `${Math.abs(days(t.dueDate))}d late` : "overdue"}
                </span>
              </Link>
            ))}
            {myWork.postDue.map((t) => (
              <Link key={t.id} href={`/tasks?task=${t.id}`}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                <Send className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                <span className="text-xs text-indigo-900 flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-indigo-600 flex-shrink-0">
                  {t.dueDate ? (days(t.dueDate) <= 0 ? "today" : `in ${days(t.dueDate)}d`) : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
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
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
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
