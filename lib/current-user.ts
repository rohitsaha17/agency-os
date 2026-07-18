import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/**
 * Lightweight current-user resolver for API routes (server-side).
 *
 * Identity comes ONLY from the httpOnly `userId` cookie set by
 * POST /api/auth/login — client-supplied headers are never trusted.
 *
 * Returns the user with organizationId, or null when unauthenticated /
 * inactive. Every tenant-scoped query MUST filter by the returned
 * organizationId.
 */
export async function getCurrentUser(_req?: Request) {
  let userId: string | null = null;

  try {
    const cookieStore = await cookies();
    userId = cookieStore.get("userId")?.value ?? null;
  } catch {
    // cookies() not available outside a request scope — ignore
  }

  // No fallback: with multiple tenants, "first OWNER in the DB" would leak
  // one org's identity to anonymous requests. No cookie/header → no user.
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, avatarUrl: true,
      organizationId: true, isActive: true,
    },
  });

  if (!user || !user.isActive) return null;
  const { isActive: _isActive, ...safe } = user;
  return safe;
}

/**
 * Client-side hook helper: fetch current user from API.
 */
export const CURRENT_USER_ENDPOINT = "/api/users/me";
