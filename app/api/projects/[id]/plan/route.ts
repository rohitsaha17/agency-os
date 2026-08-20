import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { currentCycle, ensureCycles } from "@/lib/cycles";
import { cycleSummary } from "@/lib/cycle-quota";
import { can } from "@/lib/permissions";

/**
 * GET /api/projects/[id]/plan?cycleId=
 *
 * Everything the Plan tab draws: the cycle list, the selected cycle's quota
 * meters, and that cycle's content items. Defaults to the cycle containing
 * today so the page opens on "now".
 *
 * Carries no money — quotas and counts are what an SMM is allowed to see
 * (docs/V3_CONTEXT.md §2).
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, name: true, type: true, clientId: true,
        client: { select: { id: true, name: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new ApiError("Project not found", 404);

    // An SMM may plan their OWN projects. Admin/manager may plan anything.
    const ownsProject = project.members.some(
      (m) => m.userId === user.id && m.role === "SMM",
    );
    requireCapability(user, "content.plan", { ownsProject });

    await ensureCycles(id);

    const cycles = await prisma.projectCycle.findMany({
      where: { projectId: id },
      orderBy: { startDate: "asc" },
      select: { id: true, label: true, status: true, startDate: true, endDate: true, closedAt: true },
    });

    const requested = req.nextUrl.searchParams.get("cycleId");
    const selected =
      (requested && cycles.find((c) => c.id === requested)) ||
      (await currentCycle(id)) ||
      cycles[cycles.length - 1];

    if (!selected) {
      return NextResponse.json({
        project: { id: project.id, name: project.name, type: project.type, client: project.client },
        cycles: [], cycle: null, summary: null, items: [],
        canPlan: true, canOverrideBilling: can(user, "projects.pricing"),
      });
    }

    const [summary, items] = await Promise.all([
      cycleSummary(selected.id, user.organizationId),
      prisma.contentItem.findMany({
        where: { cycleId: selected.id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, date: true, topic: true, description: true, status: true,
          referenceUrl: true, referenceFileId: true, isExtra: true, isAdHoc: true,
          billingIntent: true, carriedFromId: true, carryMode: true,
          creativeType: { select: { id: true, name: true, icon: true, color: true } },
          tasks: {
            where: { deletedAt: null },
            select: {
              id: true, status: true,
              assignees: { select: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      project: { id: project.id, name: project.name, type: project.type, client: project.client },
      cycles,
      cycle: selected,
      summary,
      items: items.map((i) => ({ ...i, date: i.date.toISOString() })),
      // A closed cycle is read-only for planning (Phase 6 locks it).
      canPlan: selected.status === "OPEN",
      // Only admin/manager may flip an EXTRA back to INCLUDED.
      canOverrideBilling: can(user, "projects.pricing"),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/plan");
  }
}
