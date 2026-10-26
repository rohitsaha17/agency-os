import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/shoots/[id] — cancel a shoot.
 *
 * A shoot is a shared, low-stakes booking, so anyone actually on it may call it
 * off, as may whoever created it and any admin. The one rule is tenancy: you
 * can only touch a shoot in your own organization. Cancelling removes the whole
 * shoot (its participant rows cascade) — there is no "leave just me" here; for
 * that, cancel and re-book, which is rare enough not to need its own door yet.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `shoots:delete:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;

    const shoot = await prisma.shoot.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, createdById: true,
        participants: { select: { userId: true } },
      },
    });
    if (!shoot) throw new ApiError("Shoot not found", 404);

    const isParticipant = shoot.participants.some((p) => p.userId === user.id);
    const isCreator = shoot.createdById === user.id;
    if (!isParticipant && !isCreator && !can(user, "users.manage")) {
      throw new ApiError("Only someone on the shoot, or an admin, can cancel it", 403);
    }

    await prisma.shoot.delete({ where: { id: shoot.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/shoots/[id]");
  }
}
