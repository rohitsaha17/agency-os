import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { DateInputAutoOpen } from "@/components/ui/DateInputAutoOpen";
import { AppTour } from "@/components/onboarding/AppTour";

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
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        passwordHash: true,
        organization: { select: { onboardingCompleted: true, plan: true, trialEndsAt: true } },
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
        <DateInputAutoOpen />
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="lg:ml-64 min-h-screen flex flex-col pt-14 lg:pt-0">
            {children}
          </main>
          <AppTour />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
