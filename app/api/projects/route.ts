import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor, requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { canViewFinancials, can } from "@/lib/permissions";
import { ensureCycles } from "@/lib/cycles";
import { createPlanningTask } from "@/lib/auto-tasks";

// GET /api/projects — list all projects with optional filters
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q") ?? "";
    const status = searchParams.get("status") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;
    const pagination = parsePagination(searchParams);

    // status supports a comma-separated list, e.g. ?status=ACTIVE,DRAFT
    const statuses = status?.split(",").map((s) => s.trim()).filter(Boolean);

    // v3: a junior sees only the projects they hold a task on
    // (docs/V3_CONTEXT.md §2). SMM and above see the whole list.
    const scopedToMyWork = !can(user, "content.plan");

    const where = {
      organizationId: user.organizationId,
      ...(scopedToMyWork && {
        tasks: { some: { deletedAt: null, assignees: { some: { userId: user.id } } } },
      }),
      ...(clientId && { clientId }),
      ...(statuses?.length === 1 && { status: statuses[0] as never }),
      ...(statuses && statuses.length > 1 && { status: { in: statuses as never[] } }),
      ...(type && { type: type as never }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, logoUrl: true } },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.paginated ? pagination.skip : undefined,
        take: pagination.paginated ? pagination.take : undefined,
      }),
      pagination.paginated ? prisma.project.count({ where }) : Promise.resolve(0),
    ]);

    // Compute progress per project with a SINGLE groupBy that counts both
    // total and DONE tasks, merged in-app — avoids the old 2-groupBy pattern.
    const projectIds = projects.map((p) => p.id);
    const grouped = projectIds.length
      ? await prisma.task.groupBy({
          by: ["projectId", "status"],
          where: { projectId: { in: projectIds }, deletedAt: null },
          _count: { _all: true },
        })
      : [];

    const totals = new Map<string, number>();
    const dones  = new Map<string, number>();
    for (const row of grouped) {
      if (!row.projectId) continue; // v2: general tasks have no project
      totals.set(row.projectId, (totals.get(row.projectId) ?? 0) + row._count._all);
      if (row.status === "DONE") {
        dones.set(row.projectId, (dones.get(row.projectId) ?? 0) + row._count._all);
      }
    }

    // v2: budgets never reach MEMBER clients (server-side strip)
    const showFinancials = canViewFinancials(user);
    const result = projects.map((p) => {
      const t = totals.get(p.id) ?? 0;
      const d = dones.get(p.id) ?? 0;
      return {
        ...p,
        budget: showFinancials ? p.budget : null,
        progress: t > 0 ? Math.round((d / t) * 100) : 0,
      };
    });

    if (pagination.paginated) {
      return jsonFor(user, {
        data: result,
        pagination: paginationMeta(pagination, total),
      });
    }
    return jsonFor(user, result);
  } catch (error) {
    return handleApiError(error, "GET /api/projects");
  }
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    // Starting a project is a planning act — SMM and above. This had no check
    // at all, so anyone signed in could open one. The price on it is still
    // gated separately by projects.pricing below, so an SMM can set up the
    // work without setting what it costs.
    requireCapability(user, "content.plan");

    const rl = checkRateLimit(req, `projects:create:${user.id}`, WRITE_RATE_LIMITS.heavy);
    if (!rl.allowed) {
      return apiError("Too many requests, please slow down", 429);
    }

    const body = await req.json();
    const {
      clientId, name, description, type, serviceType, recurringFrequency, status,
      startDate, endDate, budget, currency,
      // v3: the project IS the commercial unit
      cycleAmount, cycleUnit, cycleStartDate, cycleEndDate,
      deliverables, members,
    } = body;

    if (!clientId?.trim()) throw new ApiError("Client is required", 400);
    if (!name?.trim()) throw new ApiError("Project name is required", 400);
    if (budget != null && budget !== "" && !Number.isFinite(parseFloat(budget))) {
      throw new ApiError("Budget must be a number", 400);
    }
    for (const [label, value] of [["Start date", startDate], ["End date", endDate]] as const) {
      if (value && isNaN(new Date(value).getTime())) {
        throw new ApiError(`${label} is invalid`, 400);
      }
    }

    const canSetPricing = can(user, "projects.pricing");

    // Verify the client is in the caller's org before creating a project against it.
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    // Duplicate-name guard outside the transaction is fine — the transaction
    // only needs to atomically create the project + its channels.
    const existing = await prisma.project.findFirst({
      where: {
        organizationId: user.organizationId,
        clientId,
        name: { equals: name.trim(), mode: "insensitive" },
      },
    });
    if (existing) {
      throw new ApiError(
        `A project named "${name.trim()}" already exists for this client`,
        409
      );
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId: user.organizationId,
          clientId,
          name: name.trim(),
          description: description?.trim() || null,
          type: type || "ONE_TIME",
          serviceType: serviceType?.trim() || null,
          recurringFrequency: recurringFrequency?.trim() || null,
          status: status || "DRAFT",
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          budget: budget != null && budget !== "" ? parseFloat(budget) : null,
          currency: currency || "USD",
          // v3 commercials. Only someone with projects.pricing may set an
          // amount — an SMM creating a project leaves it null rather than
          // having their input silently accepted.
          cycleAmount: canSetPricing && cycleAmount != null && cycleAmount !== ""
            ? parseFloat(cycleAmount) : null,
          cycleUnit: cycleUnit === "WEEK" || cycleUnit === "QUARTER" ? cycleUnit : "MONTH",
          cycleStartDate: cycleStartDate ? new Date(cycleStartDate)
            : startDate ? new Date(startDate) : null,
          cycleEndDate: cycleEndDate ? new Date(cycleEndDate) : null,
          ...(Array.isArray(deliverables) && deliverables.length
            ? {
                deliverables: {
                  create: deliverables
                    .map((d: { creativeTypeId?: string; qtyPerCycle?: number | string; notes?: string }, i: number) => ({
                      creativeTypeId: String(d.creativeTypeId ?? ""),
                      qtyPerCycle: Math.max(0, Math.trunc(Number(d.qtyPerCycle ?? 0))),
                      notes: d.notes?.trim() || null,
                      sortOrder: i,
                    }))
                    .filter((d) => d.creativeTypeId && d.qtyPerCycle > 0),
                },
              }
            : {}),
        },
        include: {
          client: { select: { id: true, name: true, logoUrl: true } },
          _count: { select: { tasks: true } },
        },
      });

      // Auto-create project channels (team + client) — part of the same
      // transaction so a project is never left without its channels.
      const slug = created.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await tx.channel.createMany({
        data: [
          { organizationId: user.organizationId, name: `${slug}-team`,   description: `Internal team channel for ${created.name}`, type: "PROJECT_INTERNAL", projectId: created.id },
          { organizationId: user.organizationId, name: `${slug}-client`, description: `Client communication for ${created.name}`,  type: "PROJECT_CLIENT",   projectId: created.id },
        ],
        skipDuplicates: true,
      });

      return created;
    });

    // Cycles and the SMM's planning task happen AFTER the transaction: they
    // are follow-on effects, and a notification failing must not roll back a
    // project the user just created.
    await ensureCycles(project.id);

    const smmIds: string[] = [];
    if (Array.isArray(members)) {
      for (const m of members as { userId?: string; role?: string }[]) {
        if (!m?.userId) continue;
        const memberRole = m.role === "SMM" ? "SMM" : "CONTRIBUTOR";
        const ok = await prisma.user.findFirst({
          where: { id: m.userId, organizationId: user.organizationId, isActive: true },
          select: { id: true },
        });
        if (!ok) continue;
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: m.userId } },
          create: { projectId: project.id, userId: m.userId, role: memberRole, addedById: user.id },
          update: { role: memberRole },
        });
        if (memberRole === "SMM") smmIds.push(m.userId);
      }
    }
    for (const userId of smmIds) {
      await createPlanningTask({
        organizationId: user.organizationId,
        projectId: project.id,
        userId,
        createdById: user.id,
      });
    }

    return jsonFor(user, { ...project, progress: 0 }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/projects");
  }
}
