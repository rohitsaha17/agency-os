"use client";

/**
 * People — one module, six questions.
 *
 *   Today      what needs my attention right now
 *   Attendance who worked, and what the month looks like
 *   Staff      who works here and what we hold on them
 *   Leave      who is asking for time off, and who is out
 *   Celebrations birthdays and work anniversaries
 *   Payroll    what we owe, and what has been paid
 *   Advances   what has been lent, and what is left to come back
 *
 * Kept as one route with a `?tab=` rather than six pages, because the
 * notifications already deep-link here and because switching tabs should not
 * cost a page load. Which tabs exist depends on what you may see.
 *
 * Hiding a tab is never the guard. Every one of these calls an endpoint that
 * checks the capability itself; the tab list only decides what is worth
 * offering. A Manager who types ?tab=payroll gets an empty table and a 403 in
 * the network log, not a salary sheet.
 *
 * The search box lives up here because it means the same thing on every tab —
 * narrow this to one person. Each tab keeps its own month, filters and primary
 * action in its own toolbar, where they sit next to what they affect.
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users, CalendarCheck, CalendarRange, Plane, Wallet, HandCoins, Cake,
} from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can, type Capability } from "@/lib/permissions";
import { RequireCapability } from "@/components/layout/RequireCapability";
import { SearchBox, TableSkeleton, CardsSkeleton } from "@/components/people/kit";
import { TodayTab } from "@/components/hr/TodayTab";
import { AttendanceTab } from "@/components/hr/AttendanceTab";
import { StaffTab } from "@/components/hr/StaffTab";
import { LeaveTab } from "@/components/hr/LeaveTab";
import { PayrollTab } from "@/components/hr/PayrollTab";
import { AdvancesTab } from "@/components/hr/AdvancesTab";
import { CelebrationsTab } from "@/components/hr/CelebrationsTab";

type TabId = "today" | "attendance" | "staff" | "leave" | "celebrations" | "payroll" | "advances";

const TABS: { id: TabId; label: string; icon: typeof Users; need: Capability | null }[] = [
  { id: "today", label: "Today", icon: CalendarCheck, need: "hr.today" },
  // The month-end grid. NOT the same capability as Today any more: seeing who
  // is in right now is part of handing out work, and an SMM needs it. Reading
  // back what somebody's August looked like is a supervisor's business.
  { id: "attendance", label: "Attendance", icon: CalendarRange, need: "hr.records" },
  { id: "staff", label: "Staff", icon: Users, need: "hr.records" },
  // Everyone has their own leave, so this one is never hidden.
  { id: "leave", label: "Leave", icon: Plane, need: null },
  /*
    Also never hidden, and that is the point of it.

    Date of birth lives in the staff record, which is hr.records — but a
    birthday calendar only a manager can see is not a birthday calendar. The
    endpoint behind this sends a month and a day and never the birth year, so
    what is shared is the occasion rather than somebody's age.
  */
  { id: "celebrations", label: "Celebrations", icon: Cake, need: null },
  { id: "payroll", label: "Payroll", icon: Wallet, need: "payroll.manage" },
  { id: "advances", label: "Advances", icon: HandCoins, need: "payroll.manage" },
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
  const [query, setQuery] = useState("");
  /** Set when one tab sends you to another about a particular person. */
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!visible.length) return;
    const wanted = asked && visible.some((t) => t.id === asked) ? asked : null;
    setTab(wanted ?? visible[0].id);
  }, [asked, visible]);

  /**
   * Jumping between tabs about one person.
   *
   * The search box is cleared on the way, because arriving at Attendance with
   * a stale search from Staff is the kind of thing that reads as a bug.
   */
  const navigate = useCallback((to: TabId, userId?: string) => {
    if (!visible.some((t) => t.id === to)) return;
    setTab(to);
    setQuery("");
    setFocus(userId ?? null);
  }, [visible]);

  const clearFocus = useCallback(() => setFocus(null), []);
  const currency = user?.organization?.currency ?? "INR";
  const canManageHr = can(user, "hr.manage");
  const seesPay = can(user, "payroll.manage");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1500px] mx-auto w-full">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">People</h1>
          <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">
            Your team, attendance, time off and payroll in one place.
          </p>
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search people…"
          className="w-full sm:w-56"
        />
      </header>

      <nav
        aria-label="People sections"
        className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-white/[0.08] scrollbar-none"
      >
        {visible.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setFocus(null); }}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-300"
                  : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? "text-indigo-500" : "text-gray-400"}`} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "today" && (
        <TodayTab query={query} canManage={canManageHr} seesRecords={can(user, "hr.records")} onNavigate={navigate} />
      )}
      {tab === "attendance" && (
        <AttendanceTab
          canEdit={canManageHr} query={query}
          focusUserId={focus} onFocusHandled={clearFocus}
        />
      )}
      {tab === "staff" && (
        <StaffTab
          query={query} canEdit={canManageHr} seesPay={seesPay}
          canInvite={can(user, "users.manage")} currency={currency}
          meId={user?.id ?? null} meIsOwner={user?.role === "OWNER"}
          onNavigate={navigate}
        />
      )}
      {tab === "leave" && (
        <LeaveTab
          canDecide={canManageHr} query={query}
          focusUserId={focus} onFocusHandled={clearFocus}
        />
      )}
      {tab === "celebrations" && <CelebrationsTab query={query} />}
      {tab === "payroll" && (
        <PayrollTab
          currency={currency} query={query}
          focusUserId={focus} onFocusHandled={clearFocus}
        />
      )}
      {tab === "advances" && (
        <AdvancesTab
          currency={currency} query={query}
          focusUserId={focus} onFocusHandled={clearFocus}
        />
      )}
    </div>
  );
}

export default function HRPage() {
  return (
    <RequireCapability capability="attendance.mark" what="People">
      <Suspense
        fallback={
          <div className="p-4 sm:p-6 space-y-4 max-w-[1500px] mx-auto w-full">
            <CardsSkeleton />
            <TableSkeleton rows={6} />
          </div>
        }
      >
        <HRPageBody />
      </Suspense>
    </RequireCapability>
  );
}
