import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id] — full project detail
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        quotation: { select: { id: true, number: true, title: true, total: true, status: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!project) throw new ApiError("Project not found", 404);

    const [total, done] = await Promise.all([
      prisma.task.count({ where: { projectId: id, deletedAt: null } }),
      prisma.task.count({ where: { projectId: id, status: "DONE", deletedAt: null } }),
    ]);

    return NextResponse.json({
      ...project,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[id]");
  }
}

// PATCH /api/projects/[id] — update project
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { id } = await params;

    // Verify the project belongs to the caller's org before mutating.
    const existing = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Project not found", 404);

    const body = await req.json();
    const {
      name, description, type, serviceType, recurringFrequency, status,
      startDate, endDate, budget, currency, clientId,
    } = body;

    // If the client is being reassigned, verify that client is also in the org.
    if (clientId !== undefined && clientId !== null) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!client) throw new ApiError("Client not found", 404);
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(clientId !== undefined && { clientId }),
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type !== undefined && { type }),
        ...(serviceType !== undefined && { serviceType: serviceType?.trim() || null }),
        ...(recurringFrequency !== undefined && { recurringFrequency: recurringFrequency?.trim() || null }),
        ...(status !== undefined && { status }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(budget !== undefined && { budget: budget ? parseFloat(budget) : null }),
        ...(currency !== undefined && { currency }),
      },
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        _count: { select: { tasks: true } },
      },
    });

    const [total, done] = await Promise.all([
      prisma.task.count({ where: { projectId: id, deletedAt: null } }),
      prisma.task.count({ where: { projectId: id, status: "DONE", deletedAt: null } }),
    ]);

    return NextResponse.json({
      ...project,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Project not found", 404);
    }
    return handleApiError(error, "PATCH /api/projects/[id]");
  }
}

// DELETE /api/projects/[id] — cancel/archive
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);

    const rl = checkRateLimit(req, `projects:delete:${user.id}`, WRITE_RATE_LIMITS.heavy);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const { id } = await params;

    // Verify org ownership before archiving.
    const existing = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Project not found", 404);

    await prisma.project.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Project not found", 404);
    }
    return handleApiError(error, "DELETE /api/projects/[id]");
  }
}
