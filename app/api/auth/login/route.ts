import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";
import { verifyPassword } from "@/lib/password";

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

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" }, isActive: true },
    select: {
      id: true, name: true, email: true, role: true, passwordHash: true,
      organization: { select: { id: true, name: true, onboardingCompleted: true } },
    },
  });

  if (!user) {
    // Deliberately vague — don't reveal which emails exist.
    return apiError("No account found for that email", 404);
  }

  // Account has never set a password → send the client to the setup step.
  if (!user.passwordHash) {
    return NextResponse.json({ needsPasswordSetup: true, email: user.email });
  }

  // Phase 1: email recognised, prompt for the password (no cookie yet).
  if (password === undefined || password === null || password === "") {
    return NextResponse.json({ needsPassword: true, email: user.email });
  }

  // Phase 2: verify.
  if (!verifyPassword(String(password), user.passwordHash)) {
    return apiError("Incorrect password", 401);
  }

  const res = NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization,
    needsOnboarding: !user.organization.onboardingCompleted,
  });

  res.cookies.set("userId", user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
