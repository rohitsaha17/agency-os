import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// POST /api/content-items/[id]/carry-forward — { date }
// Clones an approved-but-unposted item to the given date (keeps approvals +
// carriedFromId), marks the original MISSED with an auto note.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "content.plan");
    const { id } = await params;
    const { date } = await req.json();
    if (!date || isNaN(new Date(date).getTime())) throw new ApiError("A valid target date is required", 400);

    const item = await prisma.contentItem.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!item) throw new ApiError("Content item not found", 404);
    if (!["TEAM_APPROVED", "CLIENT_APPROVED"].includes(item.status)) {
      throw new ApiError("Only approved-but-unposted items can be carried forward", 400);
    }

    const targetDate = new Date(date);
    const [clone] = await prisma.$transaction([
      prisma.contentItem.create({
        data: {
          organizationId: item.organizationId,
          clientId: item.clientId,
          projectId: item.projectId,
          date: targetDate,
          creativeTypeId: item.creativeTypeId,
          topic: item.topic,
          description: item.description,
          referenceUrl: item.referenceUrl,
          referenceFileId: item.referenceFileId,
          status: item.status, // approvals ride along
          teamApprovedAt: item.teamApprovedAt,
          clientApprovedAt: item.clientApprovedAt,
          isExtra: item.isExtra,
          isAdHoc: item.isAdHoc,
          carriedFromId: item.id,
          createdById: user.id,
        },
        include: { creativeType: true },
      }),
      prisma.contentItem.update({
        where: { id },
        data: { status: "MISSED" },
      }),
    ]);

    const dateLabel = targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    await logStatus({
      organizationId: user.organizationId,
      entityType: "CONTENT_ITEM",
      entityId: id,
      from: item.status,
      to: "MISSED",
      userId: user.id,
      note: `Carried to ${dateLabel}`,
    });
    await logStatus({
      organizationId: user.organizationId,
      entityType: "CONTENT_ITEM",
      entityId: clone.id,
      from: null,
      to: clone.status,
      userId: user.id,
      note: `Carried forward from ${item.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    });

    return NextResponse.json(clone, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/content-items/[id]/carry-forward");
  }
}
