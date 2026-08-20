import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { reopenCycle } from "@/lib/cycle-close";

/**
 * POST /api/cycles/[id]/reopen — undo a close.
 *
 * Admin and manager only: an SMM shouldn't be able to quietly reverse a
 * close that has already produced billing lines. Always logged.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    // projects.pricing is what separates admin/manager from SMM here — the
    // people who own the money own the undo.
    requireCapability(user, "projects.pricing");
    const { id } = await params;

    const { reason } = await req.json().catch(() => ({ reason: null }));
    const result = await reopenCycle({
      cycleId: id,
      organizationId: user.organizationId,
      userId: user.id,
      reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/cycles/[id]/reopen");
  }
}
