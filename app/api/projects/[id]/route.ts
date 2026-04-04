import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id] — full project detail
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        quotation: { select: { id: true, number: true, title: true, total: true, status: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Compute progress
    const [total, done] = await Promise.all([
      prisma.task.count({ where: { projectId: id } }),
      prisma.task.count({ where: { projectId: id, status: "DONE" } }),
    ]);

    return NextResponse.json({
      ...project,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  } catch (error) {
    console.error("[GET /api/projects/[id]]", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/projects/[id] — update project
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json();
    const {
      name, description, type, serviceType, recurringFrequency, status,
      startDate, endDate, budget, currency, clientId,
    } = body;

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
      prisma.task.count({ where: { projectId: id } }),
      prisma.task.count({ where: { projectId: id, status: "DONE" } }),
    ]);

    return NextResponse.json({
      ...project,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    console.error("[PATCH /api/projects/[id]]", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] — cancel/archive
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.project.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    console.error("[DELETE /api/projects/[id]]", error);
    return NextResponse.json({ error: "Failed to archive project" }, { status: 500 });
  }
}
