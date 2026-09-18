import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { DateInputAutoOpen } from "@/components/ui/DateInputAutoOpen";
import { AppTour } from "@/components/onboarding/AppTour";
import { CurrentUserSeed } from "@/components/layout/CurrentUserSeed";
import type { CurrentUser } from "@/lib/useCurrentUser";
import { CheckInGate } from "@/components/hr/CheckInGate";
import { attendanceDay, dayString } from "@/lib/hr";
import { can } from "@/lib/permissions";

/*
  A window wide enough to contain whichever day "today" turns out to be once
  the timezone is known. Three days of one person's attendance is a handful of
  rows.
*/
const WINDOW_FROM = () => new Date(Date.now() - 36 * 3_600_000);
const WINDOW_TO = () => new Date(Date.now() + 36 * 3_600_000);

/**
 * Dashboard shell — server-gated.
 *
 * 1. No `userId` cookie → /login
 * 2. Cookie doesn't resolve to an active user → /login
 * 3. User's organization hasn't completed onboarding → /onboarding
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  let gate: "login" | "onboarding" | "set-password" | "trial-ended" | null = null;
  let seed: CurrentUser | null = null;
  /** Nothing else on the dashboard renders until this is false. */
  let needsCheckIn = false;
  try {
    // Widened from the four gate fields to the whole shape the client needs.
    // It is the same round trip either way, and it saves the browser asking
    // /api/users/me for a user the server has already resolved.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true, designation: true,
        avatarUrl: true, organizationId: true,
        isActive: true,
        passwordHash: true,
        organization: {
          select: {
            id: true, name: true, slug: true, logoUrl: true, currency: true,
            timezone: true, dateFormat: true,
            onboardingCompleted: true, plan: true, trialEndsAt: true,
          },
        },
        // Three days either side of now, because which day counts as "today"
        // depends on the org's timezone and the 6am rule — and the timezone
        // arrives in this same query. Fetching a small window and choosing
        // afterwards costs nothing; a second query to find out what day it is
        // would cost a round trip on every page load.
        attendance: {
          where: { date: { gte: WINDOW_FROM(), lt: WINDOW_TO() } },
          select: { date: true },
        },
        leaveRequests: {
          where: {
            status: "APPROVED",
            startDate: { lt: WINDOW_TO() },
            endDate: { gte: WINDOW_FROM() },
          },
          select: { startDate: true, endDate: true },
        },
      },
    });
    if (!user || !user.isActive) gate = "login";
    else if (!user.organization.onboardingCompleted) gate = "onboarding";
    else if (!user.passwordHash) gate = "set-password";
    else if (
      user.organization.plan === "TRIAL" &&
      user.organization.trialEndsAt &&
      user.organization.trialEndsAt.getTime() < Date.now()
    ) {
      gate = "trial-ended";
    }

    /*
      The day starts with checking in.

      Everything else is behind it on purpose: the point of the board is that
      "who is in today" is true, and it stops being true the moment people can
      get on with their work without saying so. One button, once a day.

      Owners and admins are excused — they review attendance rather than
      record it, and stopping an admin at 7am to ask about their own presence
      would be asking the wrong person.

      Somebody on approved leave passes too. They are not expected in, and
      making them claim they are in order to look something up would put a
      false day into the very record this exists to keep honest.
    */
    if (user && gate === null && !can({ id: user.id, role: user.role }, "attendance.exempt")) {
      const tz = user.organization.timezone || "UTC";
      const today = attendanceDay(new Date(), tz);
      const checkedIn = user.attendance.some((a) => dayString(a.date) === today);
      const onLeave = user.leaveRequests.some(
        (l) => dayString(l.startDate) <= today && dayString(l.endDate) >= today,
      );
      needsCheckIn = !checkedIn && !onLeave;
    }

    // Everything the client's useCurrentUser would have gone and fetched.
    // `plan` and `trialEndsAt` are gate-only and stay on the server.
    if (user && gate === null) {
      const {
        isActive: _a, passwordHash, organization: org,
        attendance: _att, leaveRequests: _lv, ...rest
      } = user;
      const { plan: _plan, trialEndsAt: _t, ...orgSafe } = org;
      seed = { ...rest, hasPassword: !!passwordHash, organization: orgSafe } as CurrentUser;
    }
  } catch {
    // DB unreachable — let the page render; individual API calls will
    // surface their own errors rather than trapping the user in a loop.
  }
  if (gate === "login") redirect("/login");
  if (gate === "onboarding") redirect("/onboarding");
  if (gate === "set-password") redirect("/set-password");
  if (gate === "trial-ended") redirect("/trial-ended");

  return (
    <ToastProvider>
      <ConfirmProvider>
        <CurrentUserSeed user={seed} />
        {needsCheckIn && <CheckInGate name={seed?.name ?? ""} />}
        <DateInputAutoOpen />
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="lg:ml-64 min-h-screen flex flex-col appbar-offset lg:pt-0 safe-x">
            {children}
          </main>
          <AppTour />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
