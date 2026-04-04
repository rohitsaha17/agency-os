import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/users/[id] — update name, role, isActive
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
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
    console.error("[PATCH /api/users/[id]]", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE /api/users/[id] — soft-delete (set isActive = false)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("[DELETE /api/users/[id]]", error);
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }
}
