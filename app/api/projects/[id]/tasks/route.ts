import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { notifyMany } from "@/lib/notify";
import { logStatus } from "@/lib/audit";
import { resolveRouting, notifyHeads } from "@/lib/task-routing";
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
  id: string; projectId: string | null; parentId: string | null;
  title: string; description: string | null;
  status: string; priority: string;
  dueDate: Date | null; order: number;
  progress: number; estimatedHours: number | null; loggedHours: number;
  isClientVisible: boolean; showSubtasksToClient: boolean;
  createdAt: Date; updatedAt: Date;
  manager: { id: string; name: string } | null;
  assignees: { userId: string; user: { id: string; organizationId: string; name: string; email: string; avatarUrl: string | null; role: string } }[];
  // v2 fields
  topic: string | null; content: string | null;
  referenceUrl: string | null; referenceFileId: string | null;
  extraNote: string | null; clientId: string | null;
  contentItemId: string | null; preferredAssigneeId: string | null;
  assignmentStatus: string; sortOrder: number; isAdHoc: boolean;
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
      // v2 fields
      topic: t.topic, content: t.content,
      referenceUrl: t.referenceUrl, referenceFileId: t.referenceFileId,
      extraNote: t.extraNote, clientId: t.clientId,
      contentItemId: t.contentItemId, preferredAssigneeId: t.preferredAssigneeId,
      assignmentStatus: t.assignmentStatus as Task["assignmentStatus"],
      sortOrder: t.sortOrder, isAdHoc: t.isAdHoc,
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
      // v2 fields
      topic, content, referenceUrl, referenceFileId, extraNote,
      preferredAssigneeId, contentItemId, isAdHoc,
    } = body;

    if (!title?.trim()) {
      throw new ApiError("Task title is required", 400);
    }

    // v2: preferred-assignee routing through the Head-of-Design queue
    const routing = resolveRouting(user, preferredAssigneeId, assigneeIds);

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
        // v2 fields
        topic: topic?.trim() || null,
        content: content?.trim() || null,
        referenceUrl: referenceUrl?.trim() || null,
        referenceFileId: referenceFileId || null,
        extraNote: extraNote?.trim() || null,
        contentItemId: contentItemId || null,
        isAdHoc: !!isAdHoc,
        preferredAssigneeId: preferredAssigneeId || null,
        assignmentStatus: routing.assignmentStatus,
        ...(routing.assigneeIds.length && {
          assignees: { create: routing.assigneeIds.map((userId) => ({ userId })) },
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

    // v2: audit + notifications
    await logStatus({
      organizationId: user.organizationId,
      entityType: "TASK",
      entityId: task.id,
      from: null,
      to: task.status,
      userId: user.id,
      note: routing.assignmentStatus === "PENDING_HEAD_APPROVAL" ? "created — pending head approval" : "created",
    });
    // v2 spine: content-calendar entry moves PLANNED → ASSIGNED
    if (contentItemId) {
      const item = await prisma.contentItem.findFirst({
        where: { id: contentItemId, organizationId: user.organizationId },
        select: { id: true, status: true },
      });
      if (item && item.status === "PLANNED") {
        await prisma.contentItem.update({ where: { id: item.id }, data: { status: "ASSIGNED" } });
        await logStatus({
          organizationId: user.organizationId,
          entityType: "CONTENT_ITEM",
          entityId: item.id,
          from: "PLANNED",
          to: "ASSIGNED",
          userId: user.id,
          note: `task "${task.title}" created`,
        });
      }
    }
    if (routing.assignmentStatus === "PENDING_HEAD_APPROVAL") {
      await notifyHeads(
        user.organizationId,
        `Task "${task.title}" needs assignment approval`,
        "/tasks?tab=approvals",
      );
    } else if (routing.assigneeIds.length) {
      await notifyMany(
        routing.assigneeIds.filter((uid) => uid !== user.id),
        {
          organizationId: user.organizationId,
          type: "TASK_ASSIGNED",
          title: `You were assigned: "${task.title}"`,
          body: `Assigned by ${user.name}.`,
          link: `/projects/${projectId}?task=${task.id}`,
        },
      );
    }

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
