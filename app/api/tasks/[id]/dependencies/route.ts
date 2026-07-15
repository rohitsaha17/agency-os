import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertTaskInOrg(taskId: string, organizationId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId },
    select: { id: true },
  });
  if (!task) throw new ApiError("Task not found", 404);
}

// GET /api/tasks/[id]/dependencies
// Returns { dependsOn: [...], blockedBy: [...] }
export async function GET(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

    const [dependsOn, blockedBy] = await Promise.all([
      prisma.taskDependency.findMany({
        where: { taskId },
        include: {
          dependsOn: { select: { id: true, title: true, status: true, priority: true } },
        },
      }),
      prisma.taskDependency.findMany({
        where: { dependsOnId: taskId },
        include: {
          task: { select: { id: true, title: true, status: true, priority: true } },
        },
      }),
    ]);
    return NextResponse.json({ dependsOn, blockedBy });
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/[id]/dependencies");
  }
}

// POST /api/tasks/[id]/dependencies — add a dependency
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const user = await requireAuth(req);
    await assertTaskInOrg(taskId, user.organizationId);

    const { dependsOnId } = await req.json();
    if (!dependsOnId) {
      throw new ApiError("dependsOnId is required", 400);
    }
    if (dependsOnId === taskId) {
      throw new ApiError("A task cannot depend on itself", 400);
    }

    // The other task must ALSO be in the caller's org — otherwise we'd let a
    // user link across tenant boundaries.
    await assertTaskInOrg(dependsOnId, user.organizationId);

    // Check for circular dependency: if dependsOnId already depends on taskId
    const circular = await prisma.taskDependency.findFirst({
      where: { taskId: dependsOnId, dependsOnId: taskId },
    });
    if (circular) {
      throw new ApiError("Circular dependency detected", 400);
    }

    const dep = await prisma.taskDependency.create({
      data: { taskId, dependsOnId },
      include: {
        dependsOn: { select: { id: true, title: true, status: true, priority: true } },
      },
    });
    return NextResponse.json(dep, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Dependency already exists" }, { status: 409 });
    }
    return handleApiError(error, "POST /api/tasks/[id]/dependencies");
  }
}
