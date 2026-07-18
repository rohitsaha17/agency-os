import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const type          = searchParams.get("type");
    const status        = searchParams.get("status");
    const clientId      = searchParams.get("clientId");
    const projectId     = searchParams.get("projectId");
    const stakeholderId = searchParams.get("stakeholderId");
    const search        = searchParams.get("search");

    const contracts = await prisma.contract.findMany({
      where: {
        organizationId: user.organizationId,
        ...(type      ? { type:     type   as never } : {}),
        ...(status    ? { status:   status as never } : {}),
        ...(clientId  ? { clientId }  : {}),
        ...(projectId ? { projectId } : {}),
        ...(stakeholderId ? {
          parties: { some: { stakeholderId } },
        } : {}),
        ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        client:  { select: { id: true, name: true } },
        parties: {
          include: {
            client:      { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user:        { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contracts);
  } catch (error) {
    return handleApiError(error, "GET /api/contracts");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `contracts:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const body = await req.json();
    const { title, type, projectId, clientId, startDate, endDate, value, currency, notes, parties } = body;

    if (!title?.trim()) throw new ApiError("Title is required", 400);

    // Everything the contract links to must belong to the caller's org.
    const orgId = user.organizationId;
    if (projectId) {
      const ok = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const ok = await prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Client not found", 404);
    }
    for (const p of (parties || []) as { clientId?: string; stakeholderId?: string; userId?: string }[]) {
      if (p.clientId) {
        const ok = await prisma.client.findFirst({ where: { id: p.clientId, organizationId: orgId }, select: { id: true } });
        if (!ok) throw new ApiError("Party client not found", 404);
      }
      if (p.stakeholderId) {
        const ok = await prisma.stakeholder.findFirst({ where: { id: p.stakeholderId, organizationId: orgId }, select: { id: true } });
        if (!ok) throw new ApiError("Party stakeholder not found", 404);
      }
      if (p.userId) {
        const ok = await prisma.user.findFirst({ where: { id: p.userId, organizationId: orgId }, select: { id: true } });
        if (!ok) throw new ApiError("Party user not found", 404);
      }
    }

    const contract = await prisma.contract.create({
      data: {
        organizationId: user.organizationId,
        title:     title.trim(),
        type:      type || "NDA",
        status:    "DRAFT",
        projectId: projectId || null,
        clientId:  clientId  || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate:   endDate   ? new Date(endDate)   : null,
        value:     value ? parseFloat(value) : null,
        currency:  currency || "USD",
        notes:     notes?.trim() || null,
        parties: {
          create: (parties || []).map((p: {
            partyType: string; clientId?: string; stakeholderId?: string;
            userId?: string; name: string; email?: string;
          }) => ({
            partyType:    p.partyType,
            clientId:     p.clientId      || null,
            stakeholderId: p.stakeholderId || null,
            userId:       p.userId         || null,
            name:         p.name,
            email:        p.email          || null,
          })),
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        client:  { select: { id: true, name: true } },
        parties: {
          include: {
            client:      { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user:        { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/contracts");
  }
}
