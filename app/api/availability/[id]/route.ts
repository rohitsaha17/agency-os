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
      select: { id: true, userId: true, leaveRequestId: true },
    });
    if (!row) throw new ApiError("Not found", 404);

    /*
      Clearing a day is not the same act as creating one — it only ever makes
      somebody MORE available. So your own blocks are yours to remove even if
      your job doesn't manage its own diary, which is also how anyone tidies
      up days they blocked before that rule existed.

      With one exception, and it is the important one: a day that came from
      approved leave is not yours to clear. Letting the person on leave delete
      it would make the approval optional — ask an admin to revoke the leave,
      which removes these days properly.
    */
    const ownUnblock = row.userId === user.id && row.leaveRequestId === null;
    if (!ownUnblock && !maySetAvailability(user, row.userId)) {
      throw new ApiError(
        row.leaveRequestId
          ? "That day comes from approved leave. An admin can revoke the leave under People."
          : "You can only clear your own unavailable days",
        403,
      );
    }

    await prisma.unavailability.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/availability/[id]");
  }
}
