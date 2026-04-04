import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/tasks/[id]/dependencies
// Returns { dependsOn: [...], blockedBy: [...] }
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
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
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/tasks/[id]/dependencies — add a dependency
export async function POST(req: NextRequest, { params }: Params) {
  const { id: taskId } = await params;
  try {
    const { dependsOnId } = await req.json();
    if (!dependsOnId) {
      return NextResponse.json({ error: "dependsOnId is required" }, { status: 400 });
    }
    if (dependsOnId === taskId) {
      return NextResponse.json({ error: "A task cannot depend on itself" }, { status: 400 });
    }

    // Check for circular dependency: if dependsOnId already depends on taskId
    const circular = await prisma.taskDependency.findFirst({
      where: { taskId: dependsOnId, dependsOnId: taskId },
    });
    if (circular) {
      return NextResponse.json({ error: "Circular dependency detected" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to add dependency" }, { status: 500 });
  }
}
