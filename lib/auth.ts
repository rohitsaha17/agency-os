import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ApiError } from "@/lib/api-errors";
import type { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
};

/**
 * Resolve the current user for an API request.
 *
 * Priority:
 *   1. `x-user-id` header
 *   2. Existing `getCurrentUser()` helper (cookie / dev-fallback)
 *
 * Throws `ApiError(401)` when no user can be resolved — catch with
 * `handleApiError()` to return a consistent 401 response.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const headerUserId = req.headers.get("x-user-id");

  if (headerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: headerUserId },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    });
    if (user) return user as AuthUser;
  }

  // Fall back to existing resolver (cookie / dev-mode admin fallback)
  const user = await getCurrentUser(req);
  if (!user) {
    throw new ApiError("Authentication required", 401, "UNAUTHORIZED");
  }
  return user as AuthUser;
}

/**
 * Enforce that the authenticated user has one of the allowed roles.
 * Throws `ApiError(403)` otherwise.
 *
 * Use on destructive routes: `requireRole(user, ["ADMIN", "MANAGER"])`.
 */
export function requireRole(user: AuthUser, roles: UserRole[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(
      "You do not have permission to perform this action",
      403,
      "FORBIDDEN"
    );
  }
}
