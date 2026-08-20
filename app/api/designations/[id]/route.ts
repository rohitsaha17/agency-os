import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function findOwned(id: string, organizationId: string) {
  const row = await prisma.designationRole.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!row) throw new ApiError("Designation not found", 404);
  return row;
}

// PATCH /api/designations/[id] — rename, or toggle active / assignable
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");
    const { id } = await params;
    await findOwned(id, user.organizationId);

    const { name, isActive, canBeAssignedWork } = await req.json();

    const updated = await prisma.designationRole.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
        ...(canBeAssignedWork !== undefined ? { canBeAssignedWork: !!canBeAssignedWork } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/designations/[id]");
  }
}

// DELETE /api/designations/[id]
// Deactivates rather than deletes when people still hold the label, so their
// job title doesn't silently vanish from historical views.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");
    const { id } = await params;
    await findOwned(id, user.organizationId);

    const inUse = await prisma.user.count({ where: { designationId: id } });
    if (inUse > 0) {
      await prisma.designationRole.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `${inUse} ${inUse === 1 ? "person holds" : "people hold"} this designation — it was deactivated instead of deleted.`,
      });
    }

    await prisma.designationRole.delete({ where: { id } });
    return NextResponse.json({ success: true, deactivated: false });
  } catch (error) {
    return handleApiError(error, "DELETE /api/designations/[id]");
  }
}
