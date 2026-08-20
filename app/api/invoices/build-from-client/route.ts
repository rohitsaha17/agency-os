import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * GET /api/invoices/build-from-client?clientId=
 *
 * Everything this client can still be billed for, grouped by project and
 * cycle (docs/V3_CONTEXT.md §3). Invoiced items never come back, which is
 * what makes re-running the builder safe.
 *
 * Items still at PENDING_PRICING are returned deliberately — the builder
 * shows them greyed with "needs pricing" rather than hiding work an admin
 * hasn't got to yet.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");

    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!clientId) throw new ApiError("clientId is required", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: {
        id: true, name: true, currency: true,
        organization: { select: { currency: true } },
      },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const items = await prisma.billableItem.findMany({
      where: {
        organizationId: user.organizationId,
        clientId,
        // Never re-offer what's already billed, and never offer a waiver.
        status: { in: ["PENDING_PRICING", "READY"] },
        invoiceId: null,
      },
      include: {
        project: { select: { id: true, name: true } },
        cycle: { select: { id: true, label: true, startDate: true } },
        contentItem: {
          select: { id: true, topic: true, date: true, creativeType: { select: { name: true, icon: true, color: true } } },
        },
        flaggedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    // Grouped the way an invoice reads: project, then cycle within it.
    // Ad-hoc work belongs to no project, so it gets its own bucket at the end.
    type Group = {
      key: string;
      projectId: string | null;
      projectName: string;
      cycleId: string | null;
      cycleLabel: string | null;
      /** Sort key — an invoice should read oldest cycle first. */
      cycleStart: Date | null;
      items: typeof items;
    };
    const groups = new Map<string, Group>();
    for (const it of items) {
      const key = `${it.projectId ?? "adhoc"}:${it.cycleId ?? "none"}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          projectId: it.projectId,
          projectName: it.project?.name ?? "Ad-hoc work",
          cycleId: it.cycleId,
          cycleLabel: it.cycle?.label ?? null,
          cycleStart: it.cycle?.startDate ?? null,
          items: [],
        });
      }
      groups.get(key)!.items.push(it);
    }

    const currency = client.currency ?? client.organization.currency ?? "USD";

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      currency,
      groups: [...groups.values()].sort((a, b) => {
        // Ad-hoc last; otherwise oldest cycle first, so an invoice reads
        // chronologically.
        if (!a.projectId) return 1;
        if (!b.projectId) return -1;
        return (a.cycleStart?.getTime() ?? 0) - (b.cycleStart?.getTime() ?? 0);
      }),
      /** How many still can't be ticked — worth saying in the UI. */
      needsPricing: items.filter((i) => i.status === "PENDING_PRICING").length,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/invoices/build-from-client");
  }
}
