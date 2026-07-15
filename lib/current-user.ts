import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/**
 * Lightweight current-user resolver for API routes (server-side).
 *
 * Priority:
 *   1. `x-user-id` header (set by middleware or client)
 *   2. `userId` cookie
 *   3. Fallback: first OWNER/ADMIN user in DB (dev convenience)
 *
 * Returns the user with organizationId, or null if not found.
 * Every tenant-scoped query MUST filter by the returned organizationId.
 */
export async function getCurrentUser(req?: Request) {
  let userId: string | null = null;

  if (req) {
    userId = req.headers.get("x-user-id");
  }

  if (!userId) {
    try {
      const cookieStore = await cookies();
      userId = cookieStore.get("userId")?.value ?? null;
    } catch {
      // cookies() not available outside server components — ignore
    }
  }

  // 3. Fallback: first OWNER (then ADMIN) — dev convenience so the app
  //    works before real auth is wired.
  if (!userId) {
    const owner = await prisma.user.findFirst({
      where: { role: { in: ["OWNER", "ADMIN"] }, isActive: true },
      orderBy: { role: "asc" }, // OWNER comes before ADMIN alphabetically
      select: {
        id: true, name: true, email: true, role: true, avatarUrl: true,
        organizationId: true,
      },
    });
    return owner;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, avatarUrl: true,
      organizationId: true,
    },
  });

  return user;
}

/**
 * Client-side hook helper: fetch current user from API.
 */
export const CURRENT_USER_ENDPOINT = "/api/users/me";
