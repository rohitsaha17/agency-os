import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { closeSummary, closeCycle, type CarryDecision, type ExtraDecision } from "@/lib/cycle-close";

/**
 * GET  /api/cycles/[id]/close — everything the close wizard needs to show.
 * POST /api/cycles/[id]/close — carry, flag, lock, bill.
 *
 * Neither carries an amount: the SMM closing a cycle decides WHETHER
 * something bills, never for how much (docs/V3_CONTEXT.md §2).
 */

type Params = { params: Promise<{ id: string }> };

/** An SMM may close their own project's cycles; admin/manager any. */
async function assertCanClose(cycleId: string, user: { id: string; organizationId: string; role: string }) {
  const cycle = await prisma.projectCycle.findFirst({
    where: { id: cycleId, project: { organizationId: user.organizationId } },
    select: {
      id: true,
      project: { select: { members: { select: { userId: true, role: true } } } },
    },
  });
  if (!cycle) throw new ApiError("Cycle not found", 404);

  const ownsProject = cycle.project.members.some(
    (m) => m.userId === user.id && m.role === "SMM",
  );
  requireCapability(user, "cycles.close", { ownsProject });
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertCanClose(id, user);

    const summary = await closeSummary(id, user.organizationId);
    if (!summary) throw new ApiError("Cycle not found", 404);
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "GET /api/cycles/[id]/close");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await assertCanClose(id, user);

    const body = await req.json();
    const carry: CarryDecision[] = Array.isArray(body.carry) ? body.carry : [];
    const extras: ExtraDecision[] = Array.isArray(body.extras) ? body.extras : [];

    const result = await closeCycle({
      cycleId: id,
      organizationId: user.organizationId,
      userId: user.id,
      carry,
      extras,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/cycles/[id]/close");
  }
}
