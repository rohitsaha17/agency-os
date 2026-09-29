import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, handleApiError } from "@/lib/api-errors";
import { verifyPassword } from "@/lib/password";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

/**
 * POST /api/auth/login — email + password login (two-phase).
 *
 * Phase 1 (email only): reports whether this account needs to SET a password
 *   (first sign-in / legacy user) or ENTER an existing one — no cookie set.
 * Phase 2 (email + password): verifies the password and sets the httpOnly
 *   `userId` session cookie.
 *
 * Accounts with no password yet are routed to POST /api/auth/set-password.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "auth:login", { limit: 10, windowSeconds: 60 });
  if (!rl.allowed) return apiError("Too many attempts, please wait a minute", 429);

  let email: string | undefined;
  let password: string | undefined;
  try {
    const body = await req.json();
    email = body?.email;
    password = body?.password;
  } catch {
    return apiError("Invalid request body", 400);
  }

  const normalized = (email ?? "").toString().trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return apiError("Please enter a valid email address", 400);
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" }, isActive: true },
      select: {
        id: true, name: true, email: true, role: true, passwordHash: true,
        mustChangePassword: true, passwordSetAt: true,
        organization: { select: { id: true, name: true, onboardingCompleted: true } },
      },
    });

    if (!user) {
      // Deliberately vague — don't reveal which emails exist.
      return apiError("No account found for that email", 404);
    }

    // QA-001: never advertise that an account has no password ("needsPasswordSetup"
    // let anyone enumerate which accounts were claimable by email). A password-less
    // account behaves exactly like any other here — first-password setup happens
    // only through the invite link's single-use token (POST /api/auth/set-password),
    // never from the login screen.

    // Phase 1: email recognised, prompt for the password (no cookie yet).
    if (password === undefined || password === null || password === "") {
      return NextResponse.json({ needsPassword: true, email: user.email });
    }

    // Phase 2: verify. A password-less account can't match, and says so with the
    // same generic message as a wrong password — no "set your password" tell.
    if (!user.passwordHash || !verifyPassword(String(password), user.passwordHash)) {
      return apiError("Incorrect email or password", 401);
    }

    const res = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      needsOnboarding: !user.organization.onboardingCompleted,
      /*
        Set when an admin reset this password. The credential that just worked
        is a temporary one somebody else has seen, so the client sends them
        straight to choosing a new one.

        The cookie is still issued. They are genuinely signed in — they typed
        the current password — and being signed in is what lets them call
        change-password at all. This is a prompt, not a half-session.
      */
      mustChangePassword: user.mustChangePassword,
    });

    // Signed, tamper-proof session token bound to the current credential
    // (QA-002), not a raw user id.
    res.cookies.set(SESSION_COOKIE, signSession(user.id, user.passwordSetAt), sessionCookieOptions());

    return res;
  } catch (error) {
    // Always return JSON (never an empty 500) so the client can show the
    // real reason instead of "Unexpected end of JSON input".
    return handleApiError(error, "POST /api/auth/login");
  }
}
