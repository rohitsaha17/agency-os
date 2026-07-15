import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * POST /api/quotations/:id/convert
 *
 * Converts an APPROVED (or SENT) quotation into a Project.
 * Optionally creates one Task per line item as a starting structure.
 *
 * Body: { projectName, projectType, startDate, createTasks }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { projectName, projectType, startDate, createTasks = true } = body;

    // Load quotation with line items — scoped to the caller's org.
    const quotation = await prisma.quotation.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        lineItems: { orderBy: { order: "asc" } },
        project: true,
      },
    });

    if (!quotation) throw new ApiError("Not found", 404);
    if (quotation.status === "CONVERTED") {
      throw new ApiError("Quotation already converted", 400);
    }
    if (quotation.project) {
      throw new ApiError("A project already exists for this quotation", 400);
    }

    // ── 1. Create the project ─────────────────────────────────
    const project = await prisma.project.create({
      data: {
        organizationId: user.organizationId,
        clientId: quotation.clientId,
        quotationId: quotation.id,
        name: (projectName || quotation.title).trim(),
        description: quotation.description,
        type: projectType || (quotation.pricingType === "RETAINER" ? "RETAINER" : "ONE_TIME"),
        status: "DRAFT",
        budget: quotation.total,
        currency: quotation.currency,
        startDate: startDate ? new Date(startDate) : null,
      },
    });

    // ── 2. Create tasks from line items ───────────────────────
    if (createTasks && quotation.lineItems.length > 0) {
      await prisma.task.createMany({
        data: quotation.lineItems.map((item, i) => ({
          organizationId: user.organizationId,
          projectId: project.id,
          title: item.title,
          description: item.description,
          status: "TODO" as const,
          priority: "MEDIUM" as const,
          order: i,
          // If priced by hour, set estimatedHours = quantity
          estimatedHours:
            item.unit === "hour" || item.unit === "hours"
              ? Number(item.quantity)
              : null,
          // Due date: startDate + offset based on order if available
          dueDate: startDate
            ? new Date(new Date(startDate).getTime() + (i + 1) * 7 * 86400000)
            : null,
        })),
      });
    }

    // ── 3. Mark quotation as CONVERTED ────────────────────────
    await prisma.quotation.update({
      where: { id },
      data: { status: "CONVERTED" },
    });

    return NextResponse.json({ projectId: project.id, projectName: project.name });
  } catch (error) {
    return handleApiError(error, "POST /api/quotations/[id]/convert");
  }
}
