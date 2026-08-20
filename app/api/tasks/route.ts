import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { logStatus } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { resolveRouting, notifyHeads, assignmentRequiresApproval } from "@/lib/task-routing";

// GET /api/tasks — global tasks list with filters
// Query params: projectId, clientId, status, priority, assigneeId, q (search), includeCompleted, page, pageSize
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const projectId       = searchParams.get("projectId") ?? undefined;
    const clientId        = searchParams.get("clientId") ?? undefined;
    const status          = searchParams.get("status") ?? undefined;
    const priority        = searchParams.get("priority") ?? undefined;
    const assigneeId      = searchParams.get("assigneeId") ?? undefined;
    const q               = searchParams.get("q") ?? undefined;
    const includeCompleted = searchParams.get("includeCompleted") === "true";
    const all = searchParams.get("all") === "1"; // explicit opt-out of the cap
    const pagination = parsePagination(searchParams);

    const where = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(projectId  && { projectId }),
      ...(status     && { status: status as never }),
      ...(priority   && { priority: priority as never }),
      ...(!includeCompleted && !status && { status: { not: "DONE" as const } }),
      ...(q && {
        OR: [
          { title:       { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
        ],
      }),
      // v2: a task may be linked to a client directly OR through its project
      ...(clientId && { OR: [{ clientId }, { project: { clientId } }] }),
      ...(assigneeId && { assignees: { some: { userId: assigneeId } } }),
    };

    // Take cap: default page size when no pagination flag,
    // otherwise honor `pageSize` (validated/clamped upstream).
    // `?all=1` returns everything (the tasks page groups client-side).
    const take = pagination.paginated ? pagination.take : all ? undefined : DEFAULT_PAGE_SIZE;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          project: {
            select: {
              id: true, name: true,
              client: { select: { id: true, name: true } },
            },
          },
          client:    { select: { id: true, name: true } },
          manager:   { select: { id: true, name: true } },
          preferredAssignee: { select: { id: true, name: true } },
          assignees: {
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          },
          children: {
            where: { deletedAt: null },
            select: { id: true, status: true },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: pagination.paginated ? pagination.skip : undefined,
        take,
      }),
      pagination.paginated ? prisma.task.count({ where }) : Promise.resolve(0),
    ]);

    if (pagination.paginated) {
      return NextResponse.json({
        data: tasks,
        pagination: paginationMeta(pagination, total),
      });
    }
    return NextResponse.json(tasks);
  } catch (error) {
    return handleApiError(error, "GET /api/tasks");
  }
}

// POST /api/tasks — v2 global task creation. Supports "general tasks"
// (no client, no project), client-only tasks, and project tasks, with
// preferred-assignee routing through the Head-of-Design queue.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      title, topic, description, content, referenceUrl, referenceFileId,
      extraNote, status, priority, dueDate, clientId, projectId,
      managerId, assigneeIds, preferredAssigneeId, estimatedHours,
      contentItemId, isAdHoc, parentId,
    } = body;

    const finalTitle = (title ?? topic ?? "").toString().trim();
    if (!finalTitle) throw new ApiError("Title is required", 400);

    // Validate org ownership of every referenced entity.
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { id: true, clientId: true },
      });
      if (!project) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!client) throw new ApiError("Client not found", 404);
    }
    const peopleIds = [
      ...(assigneeIds ?? []),
      ...(managerId ? [managerId] : []),
      ...(preferredAssigneeId ? [preferredAssigneeId] : []),
    ];
    if (peopleIds.length) {
      const count = await prisma.user.count({
        where: { id: { in: peopleIds }, organizationId: user.organizationId },
      });
      if (count !== new Set(peopleIds).size) throw new ApiError("One or more users not found", 404);
    }

    const requireApproval = await assignmentRequiresApproval(user.organizationId);
    const routing = resolveRouting(user, preferredAssigneeId, assigneeIds, requireApproval);

    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
        projectId: projectId || null,
        clientId: clientId || null,
        parentId: parentId || null,
        title: finalTitle,
        topic: topic?.trim() || null,
        description: description?.trim() || null,
        content: content?.trim() || null,
        referenceUrl: referenceUrl?.trim() || null,
        referenceFileId: referenceFileId || null,
        extraNote: extraNote?.trim() || null,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        managerId: managerId || null,
        preferredAssigneeId: preferredAssigneeId || null,
        assignmentStatus: routing.assignmentStatus,
        contentItemId: contentItemId || null,
        isAdHoc: !!isAdHoc,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        ...(routing.assigneeIds.length && {
          assignees: { create: routing.assigneeIds.map((userId: string) => ({ userId })) },
        }),
      },
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        client: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        preferredAssignee: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "TASK",
      entityId: task.id,
      from: null,
      to: task.status,
      userId: user.id,
      note: routing.assignmentStatus === "PENDING_HEAD_APPROVAL" ? "created — pending head approval" : "created",
    });

    // v2 spine: assigning a task from a content-calendar entry moves the
    // entry PLANNED → ASSIGNED (logged).
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

    const taskLink = task.projectId ? `/projects/${task.projectId}?task=${task.id}` : `/tasks?task=${task.id}`;
    if (routing.assignmentStatus === "PENDING_HEAD_APPROVAL") {
      await notifyHeads(
        user.organizationId,
        `Task "${task.title}" needs assignment approval`,
        "/tasks?tab=approvals",
      );
    } else if (routing.assigneeIds.length) {
      await notifyMany(
        routing.assigneeIds.filter((uid: string) => uid !== user.id),
        {
          organizationId: user.organizationId,
          type: "TASK_ASSIGNED",
          title: `You were assigned: "${task.title}"`,
          body: `Assigned by ${user.name}.`,
          link: taskLink,
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
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "POST /api/tasks");
  }
}
