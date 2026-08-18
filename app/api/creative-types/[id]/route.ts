import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/creative-types/[id] — rename / recolor / toggles
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id } = await params;
    const { name, icon, color, countsAsShoot, isActive } = await req.json();

    const existing = await prisma.creativeType.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Creative type not found", 404);

    const updated = await prisma.creativeType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(icon !== undefined && { icon: icon?.trim() || null }),
        ...(color !== undefined && { color: color?.trim() || null }),
        ...(countsAsShoot !== undefined && { countsAsShoot: !!countsAsShoot }),
        ...(isActive !== undefined && { isActive: !!isActive }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/creative-types/[id]");
  }
}

// DELETE — soft: deactivate (items may reference it)
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id } = await params;
    const existing = await prisma.creativeType.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Creative type not found", 404);
    await prisma.creativeType.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/creative-types/[id]");
  }
}
