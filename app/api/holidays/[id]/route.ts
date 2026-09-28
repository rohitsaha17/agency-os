import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/** DELETE /api/holidays/[id] — take a day back off the list. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "settings.manage");
    const { id } = await params;

    // Scoped to the tenant in the same statement, so a guessed id from
    // another workspace deletes nothing and reports not found.
    const removed = await prisma.holiday.deleteMany({
      where: { id, organizationId: user.organizationId },
    });
    if (removed.count === 0) throw new ApiError("Holiday not found", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/holidays/[id]");
  }
}
