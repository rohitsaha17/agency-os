import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, handleApiError } from "@/lib/api-errors";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/password";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

/**
 * POST /api/auth/change-password — signed-in user changes their own password.
 * Requires the current password (when one is already set).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `auth:change-password:${user.id}`, { limit: 10, windowSeconds: 60 });
    if (!rl.allowed) return apiError("Too many attempts, please wait a minute", 429);

    const { currentPassword, newPassword } = await req.json();

    const pwError = validatePassword(newPassword);
    if (pwError) return apiError(pwError, 400);

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    // If a password already exists, the current one must match.
    if (record?.passwordHash) {
      if (!verifyPassword(String(currentPassword ?? ""), record.passwordHash)) {
        return apiError("Current password is incorrect", 401);
      }
    }

    const passwordSetAt = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(String(newPassword)),
        passwordSetAt,
        // Whatever an admin handed over is now worthless, which is the point
        // of having handed over something temporary.
        mustChangePassword: false,
      },
    });

    // Changing the password re-stamps passwordSetAt, which invalidates every
    // session token minted before now (QA-002) — including OTHER devices this
    // person is signed in on. Re-issue a fresh token for THIS session so the
    // person who just changed it isn't logged out of the tab they're using.
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, signSession(user.id, passwordSetAt), sessionCookieOptions());
    return res;
  } catch (error) {
    return handleApiError(error, "POST /api/auth/change-password");
  }
}
