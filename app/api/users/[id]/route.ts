import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

// v3: MEMBER is retired from the assignable set; TEAM replaces it.
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "SMM", "TEAM"] as const;

/**
 * Granting ADMIN is how someone gets the keys to everything, so it stays
 * with people who already hold them. users.manage is ADMIN/OWNER only today,
 * but this is checked explicitly rather than relying on that staying true.
 */
function assertMayGrant(caller: { role: string }, role: string | undefined) {
  if (role !== "ADMIN") return;
  if (caller.role !== "ADMIN" && caller.role !== "OWNER") {
    throw new ApiError("Only an admin can make someone else an admin", 403);
  }
}

const USER_FIELDS = {
  id: true, name: true, email: true, avatarUrl: true,
  role: true, isActive: true, createdAt: true,
  jobTitle: { select: { id: true, name: true, slug: true, canBeAssignedWork: true } },
} as const;

// PATCH /api/users/[id] — update name, role, isActive
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);

    // Verify the target user belongs to the caller's organization.
    const existing = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { id: true, role: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

    const { name, email, role, isActive, avatarUrl, designationId } = await req.json();

    // Profile fields (name/avatar/email) can be edited by the user themself
    // or an admin; role, designation, and active status need users.manage.
    const isSelf = caller.id === id;
    if (!isSelf || role !== undefined || isActive !== undefined || designationId !== undefined) {
      requireCapability(caller, "users.manage");
    }
    if (designationId) {
      const ok = await prisma.designationRole.findFirst({
        where: { id: designationId, organizationId: caller.organizationId },
        select: { id: true },
      });
      if (!ok) throw new ApiError("Invalid designation", 400);
    }
    if (role !== undefined) {
      if (existing.role === "OWNER") {
        throw new ApiError("The organization owner's role cannot be changed", 403);
      }
      if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError("Invalid role", 400);
      assertMayGrant(caller, role);
    }
    if (isActive === false && existing.role === "OWNER") {
      throw new ApiError("The organization owner cannot be deactivated", 403);
    }

    const normalizedEmail = email !== undefined ? String(email).trim().toLowerCase() : undefined;
    if (normalizedEmail) {
      const dup = await prisma.user.findFirst({
        where: {
          organizationId: caller.organizationId,
          email: normalizedEmail,
          NOT: { id },
        },
        select: { id: true },
      });
      if (dup) throw new ApiError("A user with this email already exists", 409);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name      !== undefined && { name }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(role      !== undefined && { role }),
        ...(isActive  !== undefined && { isActive }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(designationId !== undefined && { designationId: designationId || null }),
      },
      select: USER_FIELDS,
    });

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "PATCH /api/users/[id]");
  }
}

// DELETE /api/users/[id] — soft-delete (set isActive = false)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);
    requireCapability(caller, "users.manage");

    const existing = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { id: true, role: true },
    });
    if (!existing) throw new ApiError("User not found", 404);
    if (existing.role === "OWNER") {
      throw new ApiError("The organization owner cannot be deactivated", 403);
    }
    if (caller.id === id) {
      throw new ApiError("You cannot deactivate your own account", 400);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "DELETE /api/users/[id]");
  }
}
