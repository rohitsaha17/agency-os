import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, handleApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/current-user";
import { hashPassword, validatePassword } from "@/lib/password";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";
import { hashSetupToken } from "@/lib/setup-token";

/**
 * POST /api/auth/set-password — set an INITIAL password (account has none).
 *
 * Two entry points:
 *   • Not signed in: first-time setup. The caller MUST present the single-use
 *     setup token from their invite link (QA-001). Email alone can no longer
 *     claim an account — that let a stranger take over any not-yet-activated
 *     account in any tenant. A valid token is consumed on success (single-use).
 *   • Signed in: a logged-in user (post-onboarding, or a legacy user prompted
 *     on their next visit) sets their own password. No token needed — being
 *     signed in is the proof.
 *
 * On success the httpOnly session cookie is (re)issued so the caller is logged
 * in. To CHANGE an existing password, use /api/auth/change-password.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "auth:set-password", { limit: 10, windowSeconds: 60 });
  if (!rl.allowed) return apiError("Too many attempts, please wait a minute", 429);

  let password: string | undefined;
  let token: string | undefined;
  try {
    const body = await req.json();
    password = body?.password;
    token = body?.token;
  } catch {
    return apiError("Invalid request body", 400);
  }

  const pwError = validatePassword(password);
  if (pwError) return apiError(pwError, 400);

  try {
    const session = await getCurrentUser(req);
    let target: { id: string; passwordHash: string | null;
      organization: { onboardingCompleted: boolean } } | null = null;

    if (session) {
      // Signed-in self-set. Being authenticated is the proof of identity.
      target = await prisma.user.findFirst({
        where: { id: session.id, isActive: true },
        select: { id: true, passwordHash: true, organization: { select: { onboardingCompleted: true } } },
      });
      if (!target) return apiError("No account found", 404);
      if (target.passwordHash) {
        return apiError("A password is already set. Please sign in and change it from Settings.", 409);
      }
    } else {
      // Unauthenticated: a valid, unexpired, single-use setup token is REQUIRED.
      // Email alone is rejected outright (QA-001). One generic message for every
      // failure so a caller can't probe which accounts or tokens exist.
      const INVALID = "This setup link is invalid or has expired. Ask an admin to send a new invite.";
      if (!token || typeof token !== "string") return apiError(INVALID, 400);

      const match = await prisma.user.findFirst({
        where: { setupTokenHash: hashSetupToken(token), isActive: true },
        select: { id: true, passwordHash: true, setupTokenExpiresAt: true,
          organization: { select: { onboardingCompleted: true } } },
      });
      if (!match) return apiError(INVALID, 400);
      if (!match.setupTokenExpiresAt || match.setupTokenExpiresAt.getTime() < Date.now()) {
        return apiError(INVALID, 400);
      }
      // A token whose account already has a password is spent — refuse quietly.
      if (match.passwordHash) return apiError(INVALID, 400);
      target = match;
    }

    const passwordSetAt = new Date();
    await prisma.user.update({
      where: { id: target.id },
      // Consume the token in the same write that sets the password: single-use,
      // and no window where a used token still works.
      data: {
        passwordHash: hashPassword(String(password)), passwordSetAt,
        setupTokenHash: null, setupTokenExpiresAt: null,
      },
    });

    const res = NextResponse.json({
      ok: true,
      needsOnboarding: !target.organization.onboardingCompleted,
    });
    // Signed session token bound to the credential just set (QA-002).
    res.cookies.set(SESSION_COOKIE, signSession(target.id, passwordSetAt), sessionCookieOptions());
    return res;
  } catch (error) {
    return handleApiError(error, "POST /api/auth/set-password");
  }
}
