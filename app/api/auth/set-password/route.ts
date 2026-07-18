import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, handleApiError } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/current-user";
import { hashPassword, validatePassword } from "@/lib/password";

/**
 * POST /api/auth/set-password — set an INITIAL password (account has none).
 *
 * Two entry points:
 *   • Not signed in: first-time login. Resolve the account by `email` (the
 *     same email-trust the app already used for passwordless login) and set
 *     the password. Rejected if a password already exists.
 *   • Signed in: a logged-in user (post-onboarding, or a legacy user prompted
 *     on their next visit) sets their own password.
 *
 * On success the httpOnly `userId` cookie is (re)issued so the caller is
 * logged in. To CHANGE an existing password, use /api/auth/change-password.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "auth:set-password", { limit: 10, windowSeconds: 60 });
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

  const pwError = validatePassword(password);
  if (pwError) return apiError(pwError, 400);

  try {
    // Prefer the signed-in user; otherwise fall back to the supplied email.
    const session = await getCurrentUser(req);
    let target: { id: string; passwordHash: string | null;
      organization: { onboardingCompleted: boolean } } | null = null;

    if (session) {
      target = await prisma.user.findFirst({
        where: { id: session.id, isActive: true },
        select: { id: true, passwordHash: true, organization: { select: { onboardingCompleted: true } } },
      });
    } else {
      const normalized = (email ?? "").toString().trim().toLowerCase();
      if (!normalized || !normalized.includes("@")) {
        return apiError("Please enter a valid email address", 400);
      }
      target = await prisma.user.findFirst({
        where: { email: { equals: normalized, mode: "insensitive" }, isActive: true },
        select: { id: true, passwordHash: true, organization: { select: { onboardingCompleted: true } } },
      });
    }

    if (!target) return apiError("No account found", 404);
    if (target.passwordHash) {
      return apiError("A password is already set. Please sign in and change it from Settings.", 409);
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: hashPassword(String(password)), passwordSetAt: new Date() },
    });

    const res = NextResponse.json({
      ok: true,
      needsOnboarding: !target.organization.onboardingCompleted,
    });
    res.cookies.set("userId", target.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (error) {
    return handleApiError(error, "POST /api/auth/set-password");
  }
}
