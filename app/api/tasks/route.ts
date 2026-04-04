import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tasks — global tasks list with filters
// Query params: projectId, clientId, status, priority, assigneeId, q (search), includeCompleted
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId       = searchParams.get("projectId") ?? undefined;
  const clientId        = searchParams.get("clientId") ?? undefined;
  const status          = searchParams.get("status") ?? undefined;
  const priority        = searchParams.get("priority") ?? undefined;
  const assigneeId      = searchParams.get("assigneeId") ?? undefined;
  const q               = searchParams.get("q") ?? undefined;
  const includeCompleted = searchParams.get("includeCompleted") === "true";

  try {
    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        ...(projectId  && { projectId }),
        ...(status     && { status: status as never }),
        ...(priority   && { priority: priority as never }),
        ...(!includeCompleted && !status && { status: { not: "DONE" } }),
        ...(q && {
          OR: [
            { title:       { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }),
        ...(clientId && { project: { clientId } }),
        ...(assigneeId && { assignees: { some: { userId: assigneeId } } }),
      },
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
      take: 200,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[GET /api/tasks]", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
