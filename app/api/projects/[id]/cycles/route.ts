import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { ensureCycles } from "@/lib/cycles";

/**
 * v3 — the billing periods of a project.
 *
 * GET tops the list up first (ensureCycles), so an open-ended retainer always
 * has the current and next cycle available without a scheduled job.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    await ensureCycles(id);

    const cycles = await prisma.projectCycle.findMany({
      where: { projectId: id },
      orderBy: { startDate: "asc" },
      include: { closedBy: { select: { id: true, name: true } } },
    });

    // invoiceId is a money link — jsonFor leaves it alone (it isn't an
    // amount), but the payload goes through it for consistency.
    return jsonFor(user, cycles);
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/cycles");
  }
}
