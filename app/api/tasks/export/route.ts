import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { taskVisibilityScope, mayExportTasksFor } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { buildTaskSheetHtml } from "@/lib/pdfTemplates";
import type { CompanySettings } from "@/types";

/**
 * GET /api/tasks/export?userId=<id|all>&scope=<open|all>
 *
 * A task sheet rendered on the server, for when the browser's copy isn't
 * enough.
 *
 * The tasks page builds the same sheet from what it has already loaded, which
 * is right for a person's own list and wrong for an agency with thousands of
 * open tasks — that sheet is silently bounded by whatever the page fetched.
 * This one queries independently, so "everyone" means everyone.
 *
 * Returns HTML, not JSON. The client opens it and prints; nothing large ever
 * has to sit in the page's memory, which is the entire reason this exists.
 *
 * Permissions are the same rule as everywhere else, checked twice over:
 * `taskVisibilityScope` restricts the query to what this person may read at
 * all, and asking for somebody ELSE's sheet additionally requires
 * projects.manage. Without that second check a junior could name a colleague
 * and get an empty sheet with their colleague's name on it — not a leak, but
 * a lie, and the kind that makes people distrust the rest.
 */

/**
 * A ceiling, so one request can't try to render an unbounded document. Far
 * above any real agency's open work; if it is ever hit the sheet says so
 * rather than quietly stopping.
 */
const MAX_TASKS = 5000;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requested = searchParams.get("userId") ?? "";
    const scope = searchParams.get("scope") === "all" ? "all" : "open";

    if (!mayExportTasksFor(user, requested)) {
      throw new ApiError("You can only export your own tasks", 403);
    }

    // Resolve the subject before querying, so the sheet is titled with a real
    // person from this organisation rather than whatever id was in the URL.
    let subject = "Everyone";
    let assigneeId: string | null = null;
    if (requested !== "all") {
      const targetId = requested || user.id;
      const target = await prisma.user.findFirst({
        where: { id: targetId, organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      if (!target) throw new ApiError("Person not found", 404);
      subject = target.name;
      assigneeId = target.id;
    }

    const tasks = await prisma.task.findMany({
      where: {
        organizationId: user.organizationId,
        AND: [taskVisibilityScope(user)],
        ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}),
        ...(scope === "open" ? { status: { not: "DONE" as const } } : {}),
      },
      select: {
        id: true, title: true, description: true, status: true,
        priority: true, dueDate: true, progress: true, kind: true,
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: MAX_TASKS + 1,
    });

    const truncated = tasks.length > MAX_TASKS;
    const rows = truncated ? tasks.slice(0, MAX_TASKS) : tasks;

    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) throw new ApiError("Organization not found", 404);

    const html = buildTaskSheetHtml(
      {
        subject,
        // The server runs in UTC; without this every date on the sheet is a
        // day behind for an agency in IST generating one before 05:30.
        timezone: org.timezone,
        scope: [
          `${rows.length} task${rows.length === 1 ? "" : "s"}`,
          scope === "open" ? "open only" : "including completed",
          // Never let a cap pass silently — a sheet that stops at 5000 and
          // says nothing reads as a complete record of the work.
          truncated ? `first ${MAX_TASKS} shown` : null,
        ].filter(Boolean).join(" · "),
        generatedAt: new Date(),
        tasks: rows.map((t) => ({
          ...t,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        })),
      },
      org as unknown as CompanySettings,
    );

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Someone's workload is not something to leave in a shared cache.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/export");
  }
}
