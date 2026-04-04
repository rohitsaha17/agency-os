import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    const week     = new Date(today.getTime() + 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Run all queries in parallel ───────────────────────────
    const [
      projectsByStatus,
      allTaskStats,
      activeClients,
      quotationPipeline,
      filesInReview,
      overdueTasks,
      upcomingTaskDeadlines,
      upcomingProjectDeadlines,
      activeProjects,
      completedThisMonth,
      totalTasksThisMonth,
      recentTasks,
      recentFiles,
      recentComments,
    ] = await Promise.all([
      // Project counts by status
      prisma.project.groupBy({
        by: ["status"],
        _count: { id: true },
      }),

      // All task counts by status (excluding deleted)
      prisma.task.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { id: true },
      }),

      // Active client count
      prisma.client.count({ where: { status: "ACTIVE" } }),

      // Quotation pipeline value (draft + sent + approved)
      prisma.quotation.aggregate({
        where: { status: { in: ["DRAFT", "SENT", "APPROVED"] } },
        _sum: { total: true },
        _count: { id: true },
      }),

      // Files waiting for review
      prisma.file.count({ where: { status: "IN_REVIEW" } }),

      // Overdue tasks (dueDate past + not done)
      prisma.task.findMany({
        where: {
          dueDate: { lt: today },
          status: { notIn: ["DONE"] },
          deletedAt: null,
        },
        select: {
          id: true, title: true, dueDate: true, priority: true, status: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),

      // Tasks due in next 7 days (not done)
      prisma.task.findMany({
        where: {
          dueDate: { gte: today, lte: week },
          status: { notIn: ["DONE"] },
          deletedAt: null,
        },
        select: {
          id: true, title: true, dueDate: true, priority: true, status: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),

      // Projects ending in next 14 days (not completed)
      prisma.project.findMany({
        where: {
          endDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: {
          id: true, name: true, endDate: true, status: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { endDate: "asc" },
        take: 5,
      }),

      // Active projects with task counts for health display
      prisma.project.findMany({
        where: { status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] } },
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          client: { select: { id: true, name: true } },
          tasks: {
            where: { deletedAt: null, parentId: null },
            select: { id: true, status: true, dueDate: true, progress: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),

      // Tasks completed this month
      prisma.task.count({
        where: {
          status: "DONE",
          updatedAt: { gte: monthStart },
          deletedAt: null,
        },
      }),

      // Total tasks updated this month (for completion rate)
      prisma.task.count({
        where: {
          updatedAt: { gte: monthStart },
          deletedAt: null,
        },
      }),

      // Recent task completions (activity feed)
      prisma.task.findMany({
        where: { status: "DONE", deletedAt: null },
        select: {
          id: true, title: true, updatedAt: true, priority: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),

      // Recently uploaded files (activity feed)
      prisma.file.findMany({
        select: {
          id: true, name: true, mimeCategory: true, createdAt: true,
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Recent file comments (activity feed)
      prisma.fileComment.findMany({
        select: {
          id: true, body: true, authorName: true, createdAt: true,
          file: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

    // ── Compute stats ─────────────────────────────────────────

    const taskMap = Object.fromEntries(
      allTaskStats.map((g) => [g.status, g._count.id])
    );

    const projectMap = Object.fromEntries(
      projectsByStatus.map((g) => [g.status, g._count.id])
    );

    const totalTaskCount = Object.values(taskMap).reduce((s, v) => s + v, 0);
    const completionRate = totalTaskCount > 0
      ? Math.round((taskMap["DONE"] ?? 0) / totalTaskCount * 100)
      : 0;

    const monthCompletionRate = totalTasksThisMonth > 0
      ? Math.round((completedThisMonth / totalTasksThisMonth) * 100)
      : 0;

    // ── Project health computation ────────────────────────────

    const projectHealth = activeProjects.map((p) => {
      const tasks = p.tasks;
      const total  = tasks.length;
      const done   = tasks.filter((t) => t.status === "DONE").length;
      const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
      const overdue = tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== "DONE"
      ).length;

      // Progress: average of all task progress values (or simple done/total)
      const progress = total > 0
        ? Math.round(tasks.reduce((s, t) => s + (t.status === "DONE" ? 100 : t.progress), 0) / total)
        : 0;

      // Risk: red=overdue/blocked, amber=more than halfway through time but <50% done, green=on track
      let risk: "red" | "amber" | "green" = "green";
      if (overdue > 0 || blocked > 0) risk = "red";
      else if (p.endDate) {
        const start = p.startDate ? new Date(p.startDate).getTime() : 0;
        const end   = new Date(p.endDate).getTime();
        const elapsed = (now.getTime() - start) / (end - start);
        if (elapsed > 0.6 && progress < 50) risk = "amber";
        else if (new Date(p.endDate) < today) risk = "red";
      }

      const daysLeft = p.endDate
        ? Math.ceil((new Date(p.endDate).getTime() - now.getTime()) / 86400000)
        : null;

      return {
        id: p.id, name: p.name, status: p.status,
        client: p.client,
        progress, total, done, blocked, overdue,
        daysLeft, risk,
        endDate: p.endDate,
      };
    });

    // ── Urgent items (priority sorted) ───────────────────────

    const urgentItems: {
      type: string; id: string; title: string; subtitle: string;
      link: string; severity: "high" | "medium" | "low"; daysOverdue?: number;
    }[] = [];

    // Overdue tasks
    for (const task of overdueTasks.slice(0, 5)) {
      const daysOverdue = Math.ceil((today.getTime() - new Date(task.dueDate!).getTime()) / 86400000);
      urgentItems.push({
        type: "task_overdue",
        id: task.id,
        title: task.title,
        subtitle: `${task.project?.name ?? "No project"} · ${daysOverdue}d overdue`,
        link: `/projects/${task.project?.id}`,
        severity: daysOverdue > 3 ? "high" : "medium",
        daysOverdue,
      });
    }

    // Files waiting review
    if (filesInReview > 0) {
      urgentItems.push({
        type: "files_review",
        id: "files-review",
        title: `${filesInReview} file${filesInReview !== 1 ? "s" : ""} awaiting review`,
        subtitle: "Review and approve or request changes",
        link: "/files",
        severity: "medium",
      });
    }

    // Sent quotations awaiting response
    const sentQuotations = await prisma.quotation.findMany({
      where: { status: "SENT" },
      select: { id: true, title: true, validUntil: true, number: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
    for (const q of sentQuotations) {
      const isExpiringSoon = q.validUntil && new Date(q.validUntil).getTime() - now.getTime() < 3 * 86400000;
      urgentItems.push({
        type: "quotation_sent",
        id: q.id,
        title: q.title,
        subtitle: isExpiringSoon ? "Expiring soon — follow up" : "Awaiting client response",
        link: `/quotations/${q.id}`,
        severity: isExpiringSoon ? "high" : "low",
      });
    }

    // Blocked tasks
    const blockedTasks = await prisma.task.findMany({
      where: { status: "BLOCKED", deletedAt: null },
      select: {
        id: true, title: true,
        project: { select: { id: true, name: true } },
      },
      take: 3,
    });
    for (const task of blockedTasks) {
      urgentItems.push({
        type: "task_blocked",
        id: task.id,
        title: task.title,
        subtitle: `Blocked in ${task.project?.name ?? "unknown project"}`,
        link: `/projects/${task.project?.id}`,
        severity: "high",
      });
    }

    // Sort: high first
    urgentItems.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });

    // ── Activity feed ─────────────────────────────────────────

    type FeedItem = {
      type: string; id: string; title: string;
      subtitle: string; time: string; link: string;
    };

    const feed: FeedItem[] = [
      ...recentTasks.map((t) => ({
        type: "task_completed",
        id: t.id,
        title: `Completed: ${t.title}`,
        subtitle: t.project?.name ?? "No project",
        time: t.updatedAt.toISOString(),
        link: `/projects/${t.project?.id}`,
      })),
      ...recentFiles.map((f) => ({
        type: "file_uploaded",
        id: f.id,
        title: `Uploaded: ${f.name}`,
        subtitle: f.project?.name ?? f.client?.name ?? "No context",
        time: f.createdAt.toISOString(),
        link: "/files",
      })),
      ...recentComments.map((c) => ({
        type: "comment_added",
        id: c.id,
        title: `${c.authorName} commented on ${c.file.name}`,
        subtitle: c.body.slice(0, 60) + (c.body.length > 60 ? "…" : ""),
        time: c.createdAt.toISOString(),
        link: "/files",
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);

    // ── Response ──────────────────────────────────────────────

    return NextResponse.json({
      generatedAt: now.toISOString(),

      stats: {
        activeProjects:    projectMap["ACTIVE"] ?? 0,
        totalProjects:     Object.values(projectMap).reduce((s, v) => s + v, 0),
        overdueTasksCount: overdueTasks.length,
        blockedTasksCount: taskMap["BLOCKED"] ?? 0,
        filesInReview,
        activeClients,
        pipelineValue:     Number(quotationPipeline._sum.total ?? 0),
        openQuotations:    quotationPipeline._count.id,
        completionRate,
        monthCompletionRate,
        completedThisMonth,
      },

      taskStats: {
        todo:       taskMap["TODO"]        ?? 0,
        inProgress: taskMap["IN_PROGRESS"] ?? 0,
        inReview:   taskMap["IN_REVIEW"]   ?? 0,
        done:       taskMap["DONE"]        ?? 0,
        blocked:    taskMap["BLOCKED"]     ?? 0,
        total:      totalTaskCount,
      },

      urgentItems: urgentItems.slice(0, 8),
      projectHealth,

      upcomingDeadlines: {
        tasks:    upcomingTaskDeadlines,
        projects: upcomingProjectDeadlines,
      },

      recentActivity: feed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
