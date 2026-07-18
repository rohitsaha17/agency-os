import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

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
      ...(clientId && { project: { clientId } }),
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
          manager:   { select: { id: true, name: true } },
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
