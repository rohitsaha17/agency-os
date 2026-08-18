import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";
import {
  assertTransitionAllowed, transitionTimestamps, ContentStatusValue,
} from "@/lib/content";

type Params = { params: Promise<{ id: string }> };

const STATUSES: ContentStatusValue[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW",
  "TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED", "POSTED", "MISSED",
];

// POST /api/content-items/[id]/status — { status, note? }
// Gated transitions, timestamps, StatusHistory + notify the creator on approvals.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const { status, note } = await req.json();
    if (!STATUSES.includes(status)) throw new ApiError("Invalid status", 400);

    const item = await prisma.contentItem.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, topic: true, clientId: true, createdById: true },
    });
    if (!item) throw new ApiError("Content item not found", 404);
    if (item.status === status) return NextResponse.json({ success: true, unchanged: true });

    assertTransitionAllowed(user, status);

    const updated = await prisma.contentItem.update({
      where: { id },
      data: { status, ...transitionTimestamps(status) },
      include: { creativeType: true },
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "CONTENT_ITEM",
      entityId: id,
      from: item.status,
      to: status,
      userId: user.id,
      note: note ?? null,
    });

    if ((status === "TEAM_APPROVED" || status === "CLIENT_APPROVED") &&
        item.createdById && item.createdById !== user.id) {
      await notify({
        organizationId: user.organizationId,
        userId: item.createdById,
        type: status === "TEAM_APPROVED" ? "CONTENT_TEAM_APPROVED" : "CONTENT_CLIENT_APPROVED",
        title: `"${item.topic}" was ${status === "TEAM_APPROVED" ? "team" : "client"}-approved`,
        body: `Approved by ${user.name}.`,
        link: `/clients/${item.clientId}?tab=content`,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "POST /api/content-items/[id]/status");
  }
}
