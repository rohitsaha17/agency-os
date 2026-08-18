import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ApiError } from "@/lib/api-errors";
import type { UserRole, Designation } from "@prisma/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** v2 job label (SMM, HEAD_OF_DESIGN, …) — routing only, not a permission */
  designation: Designation | null;
  avatarUrl: string | null;
  /** The organization this user belongs to. All tenant-scoped queries
   *  MUST filter by this id. */
  organizationId: string;
};

/** v2: can this user act on the Head-of-Design approval queue? */
export function isHeadOfDesign(user: AuthUser): boolean {
  return (
    user.designation === "HEAD_OF_DESIGN" ||
    user.role === "ADMIN" ||
    user.role === "OWNER"
  );
}

/**
 * Resolve the current user for an API request (login cookie only —
 * client-supplied headers are never trusted for identity).
 *
 * Throws `ApiError(401)` when no user can be resolved.
 * The returned user has `organizationId` — always filter tenant data by it.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
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
 * Use on destructive routes: `requireRole(user, ["OWNER", "ADMIN"])`.
 */
export function requireRole(user: AuthUser, roles: UserRole[]): void {
  // OWNER is the organization's super admin — passes every role gate.
  if (user.role === "OWNER") return;
  if (!roles.includes(user.role)) {
    throw new ApiError(
      "You do not have permission to perform this action",
      403,
      "FORBIDDEN"
    );
  }
}
