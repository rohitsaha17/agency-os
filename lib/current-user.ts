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
 *
 * The organization is joined here rather than fetched separately. Measured
 * against production, one database round trip costs ~193ms of user-visible
 * time (docs/perf/BASELINE.md) — so a second query for one row of the same
 * user's org is 193ms, while widening this select to include it is free: it
 * is a primary-key join on a table with one row per tenant, inside a round
 * trip the request was already paying for. /api/users/me used to do exactly
 * that second lookup, and took twice as long as it needed to.
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
      id: true, name: true, email: true, role: true, designation: true,
      avatarUrl: true, organizationId: true, isActive: true, createdAt: true,
      // Presence only — the hash is turned into a boolean below and never
      // leaves this function.
      passwordHash: true,
      organization: {
        select: {
          id: true, name: true, slug: true, logoUrl: true,
          currency: true, timezone: true, dateFormat: true,
          onboardingCompleted: true,
        },
      },
    },
  });

  if (!user || !user.isActive) return null;
  const { isActive: _isActive, passwordHash, ...safe } = user;
  return { ...safe, hasPassword: !!passwordHash };
}

/**
 * Client-side hook helper: fetch current user from API.
 */
export const CURRENT_USER_ENDPOINT = "/api/users/me";
