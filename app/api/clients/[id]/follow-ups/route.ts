import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/follow-ups — open follow-ups for a client
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: clientId } = await params;
    const followUps = await prisma.followUp.findMany({
      where: { clientId, organizationId: user.organizationId, status: { not: "DONE" } },
      include: { assignedTo: { select: { id: true, name: true } } },
      orderBy: { dueAt: "asc" },
    });
    return NextResponse.json(followUps);
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]/follow-ups");
  }
}

// POST /api/clients/[id]/follow-ups — { note, dueAt, assignedToId? }
// assignedToId defaults to a POC-designated user, else the caller.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "clients.manage");
    const { id: clientId } = await params;
    const { note, dueAt, assignedToId } = await req.json();
    if (!note?.trim()) throw new ApiError("A note is required", 400);
    if (!dueAt || isNaN(new Date(dueAt).getTime())) throw new ApiError("A valid due date is required", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    let finalAssignee = assignedToId;
    if (!finalAssignee) {
      const poc = await prisma.user.findFirst({
        where: { organizationId: user.organizationId, isActive: true, designation: "POC" },
        select: { id: true },
      });
      finalAssignee = poc?.id ?? user.id;
    } else {
      const target = await prisma.user.findFirst({
        where: { id: finalAssignee, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!target) throw new ApiError("Assignee not found", 404);
    }

    const followUp = await prisma.followUp.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        assignedToId: finalAssignee,
        note: note.trim(),
        dueAt: new Date(dueAt),
        createdById: user.id,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    return NextResponse.json(followUp, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/clients/[id]/follow-ups");
  }
}

// PATCH /api/clients/[id]/follow-ups — { followUpId, action: "done" | "snooze", days? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "clients.manage");
    const { id: clientId } = await params;
    const { followUpId, action, days } = await req.json();

    const followUp = await prisma.followUp.findFirst({
      where: { id: followUpId, clientId, organizationId: user.organizationId },
    });
    if (!followUp) throw new ApiError("Follow-up not found", 404);

    if (action === "done") {
      const updated = await prisma.followUp.update({
        where: { id: followUpId },
        data: { status: "DONE" },
      });
      return NextResponse.json(updated);
    }
    if (action === "snooze") {
      const d = Number(days) || 1;
      const snoozedTo = new Date(Date.now() + d * 86400000);
      const updated = await prisma.followUp.update({
        where: { id: followUpId },
        data: { status: "SNOOZED", snoozedTo },
      });
      return NextResponse.json(updated);
    }
    throw new ApiError("Invalid action", 400);
  } catch (error) {
    return handleApiError(error, "PATCH /api/clients/[id]/follow-ups");
  }
}
