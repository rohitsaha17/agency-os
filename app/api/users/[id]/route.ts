import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

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
      select: { id: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

    const { name, email, role, isActive, avatarUrl } = await req.json();

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name      !== undefined && { name }),
        ...(email     !== undefined && { email }),
        ...(role      !== undefined && { role }),
        ...(isActive  !== undefined && { isActive }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, isActive: true, createdAt: true,
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

    const existing = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

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
