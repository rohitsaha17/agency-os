import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/**
 * Lightweight current-user resolver for API routes (server-side).
 *
 * Priority:
 *   1. `x-user-id` header (set by middleware or client)
 *   2. `userId` cookie
 *   3. Fallback: first ADMIN user in DB (dev convenience)
 *
 * Returns the user object with role, or null if not found.
 * This will be replaced by NextAuth session once auth is wired.
 */
export async function getCurrentUser(req?: Request) {
  let userId: string | null = null;

  // 1. Check header
  if (req) {
    userId = req.headers.get("x-user-id");
  }

  // 2. Check cookie
  if (!userId) {
    try {
      const cookieStore = await cookies();
      userId = cookieStore.get("userId")?.value ?? null;
    } catch {
      // cookies() not available outside server components — ignore
    }
  }

  // 3. Fallback: first admin user (dev only)
  if (!userId) {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    });
    return admin;
  }

  // Look up the user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  });

  return user;
}

/**
 * Client-side hook helper: fetch current user from API.
 */
export const CURRENT_USER_ENDPOINT = "/api/users/me";
