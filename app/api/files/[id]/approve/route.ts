import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

const ACTION_TO_STATUS: Record<
  "approve" | "request_changes" | "submit_review",
  "APPROVED" | "CHANGES_REQUIRED" | "IN_REVIEW"
> = {
  approve: "APPROVED",
  request_changes: "CHANGES_REQUIRED",
  submit_review: "IN_REVIEW",
};

// ── POST /api/files/[id]/approve ───────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "tasks.review");
    const { id } = await params;
    const body = await req.json();

    const { action } = body as {
      action: "approve" | "request_changes" | "submit_review";
    };

    if (!action || !ACTION_TO_STATUS[action]) {
      throw new ApiError(
        "Invalid action. Must be one of: approve, request_changes, submit_review",
        400
      );
    }

    const existing = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("File not found", 404);

    const newStatus = ACTION_TO_STATUS[action];

    const updated = await prisma.file.update({
      where: { id },
      data: { status: newStatus },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err, "POST /api/files/[id]/approve");
  }
}
