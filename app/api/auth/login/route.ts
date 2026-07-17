import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";

/**
 * POST /api/auth/login — email-based login.
 *
 * Looks up an active user by email (across all organizations — emails are
 * unique per org but this simple flow assumes one org per person) and sets
 * an httpOnly `userId` cookie that the rest of the app reads.
 *
 * NOTE: passwordless by design for now. When real credentials are needed,
 * swap this for NextAuth / Supabase Auth — the cookie contract stays.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "auth:login", { limit: 10, windowSeconds: 60 });
  if (!rl.allowed) return apiError("Too many attempts, please wait a minute", 429);

  let email: string | undefined;
  try {
    const body = await req.json();
    email = body?.email;
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
      id: true, name: true, email: true, role: true,
      organization: { select: { id: true, name: true, onboardingCompleted: true } },
    },
  });

  if (!user) {
    // Deliberately vague — don't reveal which emails exist.
    return apiError("No account found for that email", 404);
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
