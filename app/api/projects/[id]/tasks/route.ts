import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import type { Task } from "@/types";

type Params = { params: Promise<{ id: string }> };

// ── Helpers ────────────────────────────────────────────────────

async function assertProjectInOrg(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ApiError("Project not found", 404);
}

type PrismaTask = {
  id: string; projectId: string; parentId: string | null;
  title: string; description: string | null;
  status: string; priority: string;
  dueDate: Date | null; order: number;
  progress: number; estimatedHours: number | null; loggedHours: number;
  isClientVisible: boolean; showSubtasksToClient: boolean;
  createdAt: Date; updatedAt: Date;
  manager: { id: string; name: string } | null;
  assignees: { userId: string; user: { id: string; organizationId: string; name: string; email: string; avatarUrl: string | null; role: string } }[];
};

function computeProgress(task: Task): number {
  if (!task.children || task.children.length === 0) {
    return task.status === "DONE" ? 100 : 0;
  }
  const sum = task.children.reduce((acc, c) => acc + computeProgress(c), 0);
  return Math.round(sum / task.children.length);
}

function buildTree(flat: PrismaTask[]): Task[] {
  const map = new Map<string, Task>();

  for (const t of flat) {
    map.set(t.id, {
      id: t.id, projectId: t.projectId, parentId: t.parentId,
      title: t.title, description: t.description,
      status: t.status as Task["status"], priority: t.priority as Task["priority"],
      dueDate: t.dueDate?.toISOString() ?? null,
      order: t.order, progress: t.progress,
      estimatedHours: t.estimatedHours, loggedHours: t.loggedHours,
      isClientVisible: t.isClientVisible,
      showSubtasksToClient: t.showSubtasksToClient,
      manager: t.manager,
      assignees: t.assignees.map((a) => ({ userId: a.userId, user: { ...a.user, isActive: true, organizationId: a.user.organizationId, role: a.user.role as import("@/types").UserRole } })),
      children: [],
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    });
  }

  const roots: Task[] = [];
  for (const task of map.values()) {
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId)!.children!.push(task);
    } else {
      roots.push(task);
    }
  }

  const sortChildren = (tasks: Task[]) => {
    tasks.sort((a, b) => a.order - b.order);
    tasks.forEach((t) => { if (t.children?.length) sortChildren(t.children); });
  };
  sortChildren(roots);

  const setProgress = (tasks: Task[]) => {
    for (const t of tasks) {
      if (t.children?.length) setProgress(t.children);
      t.progress = computeProgress(t);
    }
  };
  setProgress(roots);

  return roots;
}

// GET /api/projects/[id]/tasks
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    await assertProjectInOrg(id, user.organizationId);

    const tasks = await prisma.task.findMany({
      where: { projectId: id, deletedAt: null, organizationId: user.organizationId },
      include: {
        manager: { select: { id: true, name: true } },
        assignees: {
          include: {
            user: { select: { id: true, organizationId: true, name: true, email: true, avatarUrl: true, role: true } },
          },
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(buildTree(tasks as PrismaTask[]));
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]/tasks");
  }
}

// POST /api/projects/[id]/tasks
export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  try {
    const user = await requireAuth(req);
    await assertProjectInOrg(projectId, user.organizationId);

    const body = await req.json();
    const {
      title, description, status, priority, dueDate, parentId,
      managerId, assigneeIds, estimatedHours,
    } = body;

    if (!title?.trim()) {
      throw new ApiError("Task title is required", 400);
    }

    // If parentId provided, verify it belongs to the same project (and thus org).
    if (parentId) {
      const parent = await prisma.task.findFirst({
        where: { id: parentId, projectId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!parent) throw new ApiError("Parent task not found", 404);
    }

    const lastSibling = await prisma.task.findFirst({
      where: { projectId, parentId: parentId ?? null, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        parentId: parentId ?? null,
        managerId: managerId ?? null,
        title: title.trim(),
        description: description?.trim() || null,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        order: (lastSibling?.order ?? -1) + 1,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        ...(assigneeIds?.length && {
          assignees: { create: (assigneeIds as string[]).map((userId) => ({ userId })) },
        }),
      },
      include: {
        manager: { select: { id: true, name: true } },
        assignees: {
          include: {
            user: { select: { id: true, organizationId: true, name: true, email: true, avatarUrl: true, role: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        ...task,
        dueDate: task.dueDate?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        children: [],
        progress: 0,
        isClientVisible: false,
        showSubtasksToClient: false,
        assignees: task.assignees.map((a) => ({ userId: a.userId, user: { ...a.user, isActive: true } })),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "POST /api/projects/[id]/tasks");
  }
}
