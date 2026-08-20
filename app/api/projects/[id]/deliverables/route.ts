import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * v3 — what a project owes its client per cycle: "15 Reels, 5 Posts, 1 Shoot".
 * Deliverables are what the Plan tab's quota meters count against (Phase 3).
 */

type Params = { params: Promise<{ id: string }> };

async function ownedProject(id: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!project) throw new ApiError("Project not found", 404);
  return project;
}

// GET — readable by anyone who can see the project; carries no money.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    await ownedProject(id, user.organizationId);

    const deliverables = await prisma.projectDeliverable.findMany({
      where: { projectId: id },
      include: {
        creativeType: { select: { id: true, name: true, icon: true, color: true, countsAsShoot: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(deliverables);
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/deliverables");
  }
}

/**
 * PUT — replace the whole set in one shot.
 *
 * The editor is a repeatable list of rows, so the natural save is "here is
 * the list now" rather than a diff. Done in a transaction so a project is
 * never briefly left with no deliverables.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "projects.manage");
    const { id } = await params;
    await ownedProject(id, user.organizationId);

    const { deliverables } = await req.json();
    if (!Array.isArray(deliverables)) {
      throw new ApiError("deliverables must be an array", 400);
    }

    const rows = deliverables
      .map((d: { creativeTypeId?: string; qtyPerCycle?: number | string; notes?: string }, i: number) => ({
        creativeTypeId: String(d.creativeTypeId ?? ""),
        qtyPerCycle: Math.max(0, Math.trunc(Number(d.qtyPerCycle ?? 0))),
        notes: d.notes?.trim() || null,
        sortOrder: i,
      }))
      .filter((d) => d.creativeTypeId && d.qtyPerCycle > 0);

    // One row per creative type — the last wins if the form sent duplicates.
    const byType = new Map(rows.map((r) => [r.creativeTypeId, r]));
    const unique = [...byType.values()];

    if (unique.length > 0) {
      const valid = await prisma.creativeType.count({
        where: { organizationId: user.organizationId, id: { in: unique.map((r) => r.creativeTypeId) } },
      });
      if (valid !== unique.length) throw new ApiError("Unknown creative type", 400);
    }

    await prisma.$transaction([
      prisma.projectDeliverable.deleteMany({ where: { projectId: id } }),
      ...(unique.length
        ? [prisma.projectDeliverable.createMany({
            data: unique.map((r) => ({ ...r, projectId: id })),
          })]
        : []),
    ]);

    const saved = await prisma.projectDeliverable.findMany({
      where: { projectId: id },
      include: { creativeType: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(saved);
  } catch (error) {
    return handleApiError(error, "PUT /api/projects/[id]/deliverables");
  }
}
