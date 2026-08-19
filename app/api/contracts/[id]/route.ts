import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

const CONTRACT_INCLUDE = {
  project: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  parties: {
    include: {
      client: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const contract = await prisma.contract.findFirst({
      where: { id, organizationId: user.organizationId },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new ApiError("Not found", 404);
    return NextResponse.json(contract);
  } catch (error) {
    return handleApiError(error, "GET /api/contracts/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);

    // Verify org ownership before mutating.
    const existing = await prisma.contract.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    const body = await req.json();
    const { title, type, status, projectId, clientId, fileId, startDate, endDate, value, currency, notes } = body;

    // Linked records must belong to the caller's org.
    const orgId = user.organizationId;
    if (projectId) {
      const ok = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Project not found", 404);
    }
    if (clientId) {
      const ok = await prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("Client not found", 404);
    }
    if (fileId) {
      const ok = await prisma.file.findFirst({ where: { id: fileId, organizationId: orgId }, select: { id: true } });
      if (!ok) throw new ApiError("File not found", 404);
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...(clientId !== undefined ? { clientId: clientId || null } : {}),
        ...(fileId !== undefined ? { fileId: fileId || null } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(value !== undefined ? { value: value ? parseFloat(value) : null } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: CONTRACT_INCLUDE,
    });
    return NextResponse.json(contract);
  } catch (error) {
    return handleApiError(error, "PATCH /api/contracts/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.contract.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/contracts/[id]");
  }
}
