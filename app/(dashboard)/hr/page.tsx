"use client";

/**
 * People — one page, because that is what was asked for: the whole staff
 * picture in one place rather than five screens that each know a third of it.
 *
 * Five tabs, and which ones exist depends on what you may see:
 *
 *   Today     who is in — anyone who hands out work
 *   Staff     the record: joining date, phone, salary if you may see it
 *   Leave     your own requests, or everyone's if you decide them
 *   Payroll   the salary sheet          ┐ payroll.manage, and the API
 *   Advances  what has been lent out    ┘ refuses these regardless
 *
 * Hiding a tab is never the guard. Every one of these calls an endpoint that
 * checks the capability itself; the tab list only decides what is worth
 * offering. A Manager who types ?tab=payroll gets an empty table and a 403
 * in the network log, not a salary sheet.
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users, CalendarCheck, Plane, Wallet, HandCoins, Search,
} from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can, type Capability } from "@/lib/permissions";
import { RequireCapability } from "@/components/layout/RequireCapability";
import { TodayTab } from "@/components/hr/TodayTab";
import { StaffTab } from "@/components/hr/StaffTab";
import { LeaveTab } from "@/components/hr/LeaveTab";
import { PayrollTab } from "@/components/hr/PayrollTab";
import { AdvancesTab } from "@/components/hr/AdvancesTab";

type TabId = "today" | "staff" | "leave" | "payroll" | "advances";

const TABS: { id: TabId; label: string; icon: typeof Users; need: Capability | null }[] = [
  { id: "today",    label: "Today",    icon: CalendarCheck, need: "hr.view" },
  { id: "staff",    label: "Staff",    icon: Users,         need: "hr.view" },
  // Everyone has their own leave, so this one is never hidden.
  { id: "leave",    label: "Leave",    icon: Plane,         need: null },
  { id: "payroll",  label: "Payroll",  icon: Wallet,        need: "payroll.manage" },
  { id: "advances", label: "Advances", icon: HandCoins,     need: "payroll.manage" },
];

function HRPageBody() {
  const { user } = useCurrentUser();
  const params = useSearchParams();
  const visible = useMemo(
    () => TABS.filter((t) => t.need === null || can(user, t.need)),
    [user],
  );

  const asked = params.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>("today");

  useEffect(() => {
    if (!visible.length) return;
    const wanted = asked && visible.some((t) => t.id === asked) ? asked : null;
    setTab(wanted ?? visible[0].id);
  }, [asked, visible]);

  const [q, setQ] = useState("");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto w-full">
      <header>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">People</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Who&rsquo;s in, who&rsquo;s off, and everything on the books.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-white/[0.08] pb-px">
        {visible.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg border-b-2 -mb-px transition-surface duration-150 ${
                active
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-300"
                  : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}

        {(tab === "staff" || tab === "today") && (
          <div className="ml-auto relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find someone"
              className="pl-8 pr-3 py-1.5 text-[13px] w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        )}
      </div>

      {tab === "today" && <TodayTab query={q} />}
      {tab === "staff" && <StaffTab query={q} canEdit={can(user, "hr.manage")} seesPay={can(user, "payroll.manage")} />}
      {tab === "leave" && <LeaveTab canDecide={can(user, "hr.manage")} />}
      {tab === "payroll" && <PayrollTab currency={user?.organization?.currency ?? "INR"} />}
      {tab === "advances" && <AdvancesTab currency={user?.organization?.currency ?? "INR"} />}
    </div>
  );
}

export default function HRPage() {
  return (
    <RequireCapability capability="attendance.mark" what="People">
      <Suspense fallback={<div className="p-6 h-40 rounded-xl bg-gray-100 dark:bg-white/[0.06] animate-pulse" />}>
        <HRPageBody />
      </Suspense>
    </RequireCapability>
  );
}
