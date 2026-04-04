import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const { id } = await params;
    const body = await req.json();

    const { action } = body as {
      action: "approve" | "request_changes" | "submit_review";
    };

    if (!action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json(
        {
          error:
            "Invalid action. Must be one of: approve, request_changes, submit_review",
        },
        { status: 400 }
      );
    }

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
    console.error("[POST /api/files/[id]/approve]", err);
    return NextResponse.json(
      { error: "Failed to update file status" },
      { status: 500 }
    );
  }
}
