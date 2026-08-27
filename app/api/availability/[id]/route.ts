import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { maySetAvailability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/availability/[id] — a day is free again.
 *
 * Same rule as setting one: your own, or an admin's to clear. An SMM cannot
 * delete a photographer's block, because being able to remove the constraint
 * you are supposed to plan around defeats the point of having it.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `availability:delete:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;

    const row = await prisma.unavailability.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, userId: true },
    });
    if (!row) throw new ApiError("Not found", 404);

    if (!maySetAvailability(user, row.userId)) {
      throw new ApiError("You can only clear your own unavailable days", 403);
    }

    await prisma.unavailability.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/availability/[id]");
  }
}
