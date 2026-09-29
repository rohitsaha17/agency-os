import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

/**
 * First-time password setup. Two ways in:
 *   • Signed in with no password yet (post-onboarding / legacy) — session is
 *     the proof, no token needed.
 *   • Not signed in, arriving from an invite link that carries a single-use
 *     ?token= — the token is the proof (validated server-side on submit).
 *
 * Server-gated so it never flashes for people who don't need it. The token is
 * NOT validated here (that would let this page probe token validity); the
 * server checks it on POST /api/auth/set-password.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { name: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive) redirect("/login");
    // Already has a password → nothing to do here.
    if (user.passwordHash) redirect("/");
    return <SetPasswordForm name={user.name} />;
  }

  // Not signed in: only the invite-link flow is allowed.
  if (!token) redirect("/login");
  return <SetPasswordForm token={token} />;
}
