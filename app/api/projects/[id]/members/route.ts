import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { createPlanningTask } from "@/lib/auto-tasks";

/**
 * v3 — who is on a project, and in what capacity.
 *
 * Adding an SMM is the event that starts the whole flow: it creates their
 * "plan this project" task automatically (docs/V3_CONTEXT.md §3).
 */

type Params = { params: Promise<{ id: string }> };

const MEMBER_SELECT = {
  userId: true,
  role: true,
  addedAt: true,
  user: {
    select: {
      id: true, name: true, email: true, avatarUrl: true, role: true,
      jobTitle: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      select: MEMBER_SELECT,
      orderBy: { addedAt: "asc" },
    });
    return NextResponse.json(members);
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/members");
  }
}

// POST { userId, role } — add someone to the project
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "projects.assignSmm");
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, organizationId: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    // planningDueAt: optional, set by whoever assigns the SMM.
    const { userId, role, planningDueAt } = await req.json();
    if (!userId) throw new ApiError("userId is required", 400);
    const memberRole = role === "SMM" ? "SMM" : "CONTRIBUTOR";

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true },
    });
    if (!target) throw new ApiError("User not found", 404);

    // Re-adding the same person is a no-op rather than an error — the form
    // can send the full member list without the caller tracking diffs.
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId } },
      create: { projectId: id, userId, role: memberRole, addedById: user.id },
      update: { role: memberRole },
    });

    // The event that starts the flow. One planning task exists per project, so
    // adding a second SMM joins them to the existing one rather than creating
    // a duplicate of the same job.
    let planningTaskId: string | null = null;
    if (memberRole === "SMM") {
      planningTaskId = await createPlanningTask({
        planningDueDate: planningDueAt ? new Date(planningDueAt) : null,
        organizationId: project.organizationId,
        projectId: id,
        userIds: [userId],
        createdById: user.id,
      });
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      select: MEMBER_SELECT,
      orderBy: { addedAt: "asc" },
    });
    return NextResponse.json({ members, planningTaskId }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/projects/[id]/members");
  }
}

// DELETE ?userId= — remove someone from the project
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "projects.assignSmm");
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) throw new ApiError("userId is required", 400);

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!project) throw new ApiError("Project not found", 404);

    await prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/projects/[id]/members");
  }
}
