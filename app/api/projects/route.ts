import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/projects — list all projects with optional filters
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const clientId = searchParams.get("clientId") ?? undefined;

  try {
    const projects = await prisma.project.findMany({
      where: {
        ...(clientId && { clientId }),
        ...(status && { status: status as never }),
        ...(type && { type: type as never }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute progress for each project
    const projectIds = projects.map((p) => p.id);
    const taskCounts = await prisma.task.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
    });
    const doneCounts = await prisma.task.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: "DONE" },
      _count: { id: true },
    });

    const totalMap = Object.fromEntries(taskCounts.map((t) => [t.projectId, t._count.id]));
    const doneMap = Object.fromEntries(doneCounts.map((t) => [t.projectId, t._count.id]));

    const result = projects.map((p) => ({
      ...p,
      progress:
        totalMap[p.id] > 0
          ? Math.round(((doneMap[p.id] ?? 0) / totalMap[p.id]) * 100)
          : 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return NextResponse.json(
      { error: "Database unavailable. Please configure PostgreSQL." },
      { status: 503 }
    );
  }
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clientId, name, description, type, serviceType, recurringFrequency, status,
      startDate, endDate, budget, currency,
    } = body;

    if (!clientId?.trim()) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    // Check for duplicate project name under the same client
    const existing = await prisma.project.findFirst({
      where: { clientId, name: { equals: name.trim(), mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A project named "${name.trim()}" already exists for this client` },
        { status: 409 }
      );
    }

    const project = await prisma.project.create({
      data: {
        clientId,
        name: name.trim(),
        description: description?.trim() || null,
        type: type || "ONE_TIME",
        serviceType: serviceType?.trim() || null,
        recurringFrequency: recurringFrequency?.trim() || null,
        status: status || "DRAFT",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        budget: budget ? parseFloat(budget) : null,
        currency: currency || "USD",
      },
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        _count: { select: { tasks: true } },
      },
    });

    // Auto-create project channels (team + client) — non-blocking
    try {
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await prisma.channel.createMany({
        data: [
          { name: `${slug}-team`,   description: `Internal team channel for ${project.name}`, type: "PROJECT_INTERNAL", projectId: project.id },
          { name: `${slug}-client`, description: `Client communication for ${project.name}`,  type: "PROJECT_CLIENT",   projectId: project.id },
        ],
        skipDuplicates: true,
      });
    } catch (channelErr) {
      // Channel creation is best-effort — don't fail the project creation
      console.warn("[POST /api/projects] Could not auto-create channels:", channelErr);
    }

    return NextResponse.json({ ...project, progress: 0 }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
