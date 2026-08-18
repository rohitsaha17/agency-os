import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;

// v2 job labels — routing & report targeting, not permissions.
const DESIGNATIONS = [
  "SMM", "DESIGNER", "EDITOR", "HEAD_OF_DESIGN",
  "PHOTOGRAPHER", "SME", "POC", "OTHER",
] as const;

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

    const { name, email, role, isActive, avatarUrl, designation } = await req.json();

    // Profile fields (name/avatar/email) can be edited by the user themself
    // or an admin; role, designation, and active status are admin-only.
    const isSelf = caller.id === id;
    if (!isSelf || role !== undefined || isActive !== undefined || designation !== undefined) {
      requireRole(caller, ["ADMIN"]);
    }
    if (designation !== undefined && designation !== null && !DESIGNATIONS.includes(designation)) {
      throw new ApiError("Invalid designation", 400);
    }
    if (role !== undefined) {
      if (existing.role === "OWNER") {
        throw new ApiError("The organization owner's role cannot be changed", 403);
      }
      if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError("Invalid role", 400);
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
        ...(designation !== undefined && { designation }),
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, designation: true, isActive: true, createdAt: true,
      },
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
    requireRole(caller, ["ADMIN"]);

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
