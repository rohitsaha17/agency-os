import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { cycleForDate } from "@/lib/cycles";
import { quotaCheck } from "@/lib/cycle-quota";
import { createContentWorkTask } from "@/lib/auto-tasks";

const ITEM_INCLUDE = {
  creativeType: true,
  client: { select: { id: true, name: true } },
  // v3: the client roll-up groups and colours by project
  project: { select: { id: true, name: true } },
  carriedFrom: { select: { id: true, date: true } },
  createdBy: { select: { id: true, name: true } },
  tasks: {
    where: { deletedAt: null },
    select: {
      id: true, title: true, status: true, projectId: true, assignmentStatus: true,
      assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  },
} as const;

function serialize(item: {
  date: Date; createdAt: Date; updatedAt: Date;
  postedAt: Date | null; teamApprovedAt: Date | null; clientApprovedAt: Date | null;
  [k: string]: unknown;
}) {
  return {
    ...item,
    date: item.date.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    postedAt: item.postedAt?.toISOString() ?? null,
    teamApprovedAt: item.teamApprovedAt?.toISOString() ?? null,
    clientApprovedAt: item.clientApprovedAt?.toISOString() ?? null,
  };
}

// GET /api/content-items?clientId=&month=YYYY-MM (or from/to) — org-scoped
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const clientId = sp.get("clientId") ?? undefined;
    const month = sp.get("month"); // YYYY-MM
    const from = sp.get("from");
    const to = sp.get("to");

    let range: { gte?: Date; lt?: Date } | undefined;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    } else if (from || to) {
      range = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(to) } : {}),
      };
    }

    const items = await prisma.contentItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId && { clientId }),
        ...(range && { date: range }),
      },
      include: ITEM_INCLUDE,
      orderBy: { date: "asc" },
    });
    return NextResponse.json(items.map(serialize));
  } catch (error) {
    return handleApiError(error, "GET /api/content-items");
  }
}

// POST /api/content-items — add an entry to a client's content calendar
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const {
      clientId, projectId, date, creativeTypeId, topic, description,
      referenceUrl, referenceFileId, isExtra, isAdHoc,
      // v3: planning happens against a project cycle, and may assign in the
      // same action (Phase 4 turns assigneeId into the junior's task).
      cycleId, assigneeId, taskDueAt, acknowledgeExtra,
    } = await req.json();

    if (!clientId) throw new ApiError("Client is required", 400);
    if (!date || isNaN(new Date(date).getTime())) throw new ApiError("A valid date is required", 400);
    if (!creativeTypeId) throw new ApiError("Creative type is required", 400);
    if (!topic?.trim()) throw new ApiError("Topic is required", 400);

    const [client, type] = await Promise.all([
      prisma.client.findFirst({ where: { id: clientId, organizationId: user.organizationId }, select: { id: true } }),
      prisma.creativeType.findFirst({ where: { id: creativeTypeId, organizationId: user.organizationId }, select: { id: true } }),
    ]);
    if (!client) throw new ApiError("Client not found", 404);
    if (!type) throw new ApiError("Creative type not found", 404);
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId, clientId },
        select: { id: true },
      });
      if (!project) throw new ApiError("Project not found for this client", 404);
    }

    // v3: work out which cycle this date falls into, then check the quota.
    // Planning beyond the deal is allowed but must be acknowledged, and the
    // item is flagged EXTRA_BILLABLE so cycle close can price it later.
    let resolvedCycleId: string | null = cycleId ?? null;
    if (!resolvedCycleId && projectId) {
      const cycle = await cycleForDate(projectId, new Date(date));
      resolvedCycleId = cycle?.id ?? null;
    }

    let beyondQuota = false;
    if (resolvedCycleId && !isExtra) {
      const q = await quotaCheck(resolvedCycleId, creativeTypeId, user.organizationId);
      beyondQuota = q.full;
      if (beyondQuota && !acknowledgeExtra) {
        // Not an error — the caller needs to confirm, so tell them what
        // they're about to do rather than silently deciding for them.
        return NextResponse.json(
          {
            needsExtraConfirmation: true,
            quota: q,
            message: `Quota is full (${q.used}/${q.quota}) — this will be an EXTRA.`,
          },
          { status: 409 },
        );
      }
    }

    const item = await prisma.contentItem.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        projectId: projectId || null,
        cycleId: resolvedCycleId,
        date: new Date(date),
        creativeTypeId,
        topic: topic.trim(),
        description: description?.trim() || null,
        referenceUrl: referenceUrl?.trim() || null,
        referenceFileId: referenceFileId || null,
        isExtra: !!isExtra || beyondQuota,
        billingIntent: (!!isExtra || beyondQuota) ? "EXTRA_BILLABLE" : "INCLUDED",
        isAdHoc: !!isAdHoc,
        createdById: user.id,
      },
      include: ITEM_INCLUDE,
    });

    await logStatus({
      organizationId: user.organizationId,
      entityType: "CONTENT_ITEM",
      entityId: item.id,
      from: null,
      to: "PLANNED",
      userId: user.id,
      note: beyondQuota ? "planned — beyond quota, flagged EXTRA" : "planned",
    });

    // v3: planning and delegating in one action. The assigner becomes the
    // approver, so the work comes back to whoever briefed it.
    if (assigneeId) {
      await createContentWorkTask({
        organizationId: user.organizationId,
        contentItemId: item.id,
        assigneeId,
        approverId: user.id,
        // When the work is due is a separate decision from when it goes out —
        // creatives are usually wanted ready ahead of the slot. Falls back to
        // publish-date-minus-two when the SMM doesn't set one.
        dueDate: taskDueAt ? new Date(taskDueAt) : undefined,
      });
    }

    const fresh = await prisma.contentItem.findUnique({
      where: { id: item.id },
      include: ITEM_INCLUDE,
    });

    return NextResponse.json(serialize(fresh ?? item), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/content-items");
  }
}
