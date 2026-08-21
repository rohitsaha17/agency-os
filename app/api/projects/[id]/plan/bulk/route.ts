import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPlanningTask } from "@/lib/auto-tasks";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { cycleForDate } from "@/lib/cycles";

/**
 * POST /api/projects/[id]/plan/bulk
 *
 * "Add multiple": lay out N items of one creative type every K days from a
 * start date. Laying out fifteen reels by hand is the single most tedious
 * thing an SMM does, so the slots get created empty and each still needs a
 * topic before it can be assigned (docs/V3_CONTEXT.md §3).
 *
 * Body: { creativeTypeId, count, startDate, intervalDays, topicPrefix? }
 */

type Params = { params: Promise<{ id: string }> };

const MAX_ITEMS = 60; // a cycle should never need more than this

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, clientId: true,
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new ApiError("Project not found", 404);

    const ownsProject = project.members.some((m) => m.userId === user.id && m.role === "SMM");
    requireCapability(user, "content.plan", { ownsProject });

    const { creativeTypeId, count, startDate, intervalDays, topicPrefix } = await req.json();

    const n = Math.trunc(Number(count));
    const gap = Math.max(1, Math.trunc(Number(intervalDays ?? 1)));
    if (!creativeTypeId) throw new ApiError("Creative type is required", 400);
    if (!Number.isFinite(n) || n < 1) throw new ApiError("Count must be at least 1", 400);
    if (n > MAX_ITEMS) throw new ApiError(`Count must be ${MAX_ITEMS} or fewer`, 400);
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      throw new ApiError("A valid start date is required", 400);
    }

    const type = await prisma.creativeType.findFirst({
      where: { id: creativeTypeId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!type) throw new ApiError("Creative type not found", 404);

    const start = new Date(startDate);
    const created: string[] = [];
    let outsideCycle = 0;

    for (let i = 0; i < n; i++) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + i * gap);

      // A run can spill past the cycle's end; those items land in the next
      // cycle rather than being silently dropped.
      const cycle = await cycleForDate(id, date);
      if (!cycle) { outsideCycle++; continue; }
      if (cycle.status === "CLOSED") { outsideCycle++; continue; }

      const item = await prisma.contentItem.create({
        data: {
          organizationId: user.organizationId,
          clientId: project.clientId,
          projectId: id,
          cycleId: cycle.id,
          date,
          creativeTypeId,
          // A placeholder the SMM fills in — the item can't be assigned
          // until it has a real topic.
          topic: topicPrefix?.trim()
            ? `${topicPrefix.trim()} ${i + 1}`
            : `${type.name} ${i + 1}`,
          createdById: user.id,
        },
        select: { id: true },
      });
      created.push(item.id);
      await logStatus({
        organizationId: user.organizationId,
        entityType: "CONTENT_ITEM",
        entityId: item.id,
        to: "PLANNED",
        userId: user.id,
        note: "planned in bulk",
      });
    }

    await syncPlanningTask(id, user.organizationId);

    return NextResponse.json(
      {
        created: created.length,
        skipped: outsideCycle,
        message: outsideCycle
          ? `${created.length} planned. ${outsideCycle} fell outside an open cycle and were skipped.`
          : `${created.length} planned.`,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "POST /api/projects/[id]/plan/bulk");
  }
}
