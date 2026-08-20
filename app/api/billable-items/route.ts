import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * v3 — the billing bridge (docs/V3_CONTEXT.md §3).
 *
 * Entirely money, so the whole route needs financials.view. An SMM flags
 * what should bill; only the people here ever see or set an amount.
 *
 * GET  /api/billable-items?status=&clientId=&unbilled=1
 * POST /api/billable-items — an ad-hoc line outside any project
 */

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "financials.view");

    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const clientId = sp.get("clientId");
    // Phase 7's invoice builder asks for "what can I still bill?"
    const unbilled = sp.get("unbilled") === "1";

    const items = await prisma.billableItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId ? { clientId } : {}),
        ...(status ? { status: status as never } : {}),
        ...(unbilled ? { status: { in: ["PENDING_PRICING", "READY"] }, invoiceId: null } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        cycle: { select: { id: true, label: true } },
        contentItem: {
          select: { id: true, topic: true, date: true, creativeType: { select: { name: true, icon: true } } },
        },
        flaggedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, "GET /api/billable-items");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");

    const { clientId, label, amount, taskId, notes } = await req.json();
    if (!clientId) throw new ApiError("clientId is required", 400);
    if (!label?.trim()) throw new ApiError("A label is required", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const created = await prisma.billableItem.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        taskId: taskId || null,
        label: label.trim(),
        kind: "ADHOC_TASK",
        flaggedById: user.id,
        amount: amount != null && amount !== "" ? parseFloat(amount) : null,
        status: amount != null && amount !== "" ? "READY" : "PENDING_PRICING",
        notes: notes?.trim() || null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/billable-items");
  }
}
