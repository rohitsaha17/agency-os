import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Clock, Mail } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LogoutButton } from "@/components/auth/LogoutButton";

/**
 * Shown when a workspace's trial has ended. Server-gated: only reachable
 * for a signed-in user whose org is on an expired TRIAL plan.
 */
export default async function TrialEndedPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      organization: { select: { name: true, plan: true, trialEndsAt: true } },
    },
  });
  if (!user || !user.isActive) redirect("/login");

  const org = user.organization;
  const expired =
    org.plan === "TRIAL" && org.trialEndsAt && org.trialEndsAt.getTime() < Date.now();
  // Trial is active or the plan is full → nothing to see here.
  if (!expired) redirect("/");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-3 text-white mb-8">
          <BrandLogo className="w-9 h-9" />
          <div className="leading-tight text-left">
            <p className="text-lg font-bold tracking-tight">Vibrnd</p>
            <p className="text-[10px] font-medium tracking-[0.25em] uppercase text-slate-400">Studio Flow</p>
          </div>
        </div>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 mb-4">
          <Clock className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Your free trial has ended</h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          The trial for <span className="text-slate-200 font-medium">{org.name}</span> is over.
          Your data is safe and untouched — upgrade to a full plan to pick up right where you left off.
        </p>

        <a
          href="mailto:hello@vibrnd.studio?subject=Upgrade%20my%20Vibrnd%20workspace"
          className="mt-7 inline-flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Mail className="w-4 h-4" /> Contact us to upgrade
        </a>

        <div className="mt-4">
          <LogoutButton className="text-xs text-slate-500 hover:text-slate-300 transition-colors" />
        </div>

        <p className="mt-6 text-[11px] text-slate-600">
          Already upgraded? <Link href="/" className="underline hover:text-slate-400">Refresh your workspace</Link>.
        </p>
      </div>
    </div>
  );
}
