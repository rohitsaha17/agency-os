import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError, apiError } from "@/lib/api-errors";
import { logStatus } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

const ITEM_SELECT = {
  id: true, topic: true, description: true, referenceUrl: true,
  date: true, status: true,
  creativeType: { select: { name: true, icon: true, color: true } },
} as const;

/**
 * Resolve a review token to its items + branding. Works for both
 * single-item tokens (ContentItem.reviewToken) and batch tokens
 * (ReviewBatch.token). Returns null when unknown/expired/revoked.
 */
async function resolveToken(token: string) {
  const item = await prisma.contentItem.findUnique({
    where: { reviewToken: token },
    select: {
      ...ITEM_SELECT,
      organizationId: true, clientId: true, reviewTokenExpiresAt: true,
      client: { select: { name: true, logoUrl: true } },
      organization: { select: { name: true, letterheadColor: true, logoUrl: true } },
    },
  });
  if (item) {
    if (item.reviewTokenExpiresAt && item.reviewTokenExpiresAt < new Date()) return { expired: true as const };
    return {
      kind: "item" as const,
      organizationId: item.organizationId,
      clientId: item.clientId,
      clientName: item.client.name,
      clientLogoUrl: item.client.logoUrl,
      orgName: item.organization.name,
      accent: item.organization.letterheadColor,
      items: [item],
    };
  }

  const batch = await prisma.reviewBatch.findUnique({
    where: { token },
    include: {
      client: { select: { name: true, logoUrl: true } },
      organization: { select: { name: true, letterheadColor: true } },
    },
  });
  if (!batch) return null;
  if (batch.revokedAt || batch.expiresAt < new Date()) return { expired: true as const };

  const [y, m] = batch.month.split("-").map(Number);
  const items = await prisma.contentItem.findMany({
    where: {
      organizationId: batch.organizationId,
      clientId: batch.clientId,
      date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) },
      status: { in: ["TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED", "POSTED"] },
    },
    select: ITEM_SELECT,
    orderBy: { date: "asc" },
  });
  return {
    kind: "batch" as const,
    organizationId: batch.organizationId,
    clientId: batch.clientId,
    clientName: batch.client.name,
    clientLogoUrl: batch.client.logoUrl,
    orgName: batch.organization.name,
    accent: batch.organization.letterheadColor,
    items,
  };
}

// GET /api/review/[token] — PUBLIC (no login). Rate-limited.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const rl = checkRateLimit(req, "review:read", { limit: 60, windowSeconds: 60 });
    if (!rl.allowed) return apiError("Too many requests", 429);
    const { token } = await params;
    const resolved = await resolveToken(token);
    if (!resolved) throw new ApiError("This review link is invalid", 404);
    if ("expired" in resolved) throw new ApiError("This review link has expired or was revoked", 410);
    // Only expose what the client needs — no org internals.
    return NextResponse.json({
      clientName: resolved.clientName,
      clientLogoUrl: resolved.clientLogoUrl,
      orgName: resolved.orgName,
      accent: resolved.accent ?? "#6366f1",
      items: resolved.items.map((i) => ({
        id: i.id,
        topic: i.topic,
        description: i.description,
        referenceUrl: i.referenceUrl,
        date: i.date.toISOString(),
        status: i.status,
        creativeType: i.creativeType,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/review/[token]");
  }
}

// POST /api/review/[token] — { itemId, action: "approve" | "request_changes", comment? }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const rl = checkRateLimit(req, "review:act", { limit: 20, windowSeconds: 60 });
    if (!rl.allowed) return apiError("Too many requests", 429);
    const { token } = await params;
    const { itemId, action, comment } = await req.json();

    const resolved = await resolveToken(token);
    if (!resolved) throw new ApiError("This review link is invalid", 404);
    if ("expired" in resolved) throw new ApiError("This review link has expired or was revoked", 410);

    const target = resolved.items.find((i) => i.id === itemId);
    if (!target) throw new ApiError("Item not found on this review link", 404);

    const full = await prisma.contentItem.findUnique({
      where: { id: itemId },
      include: {
        tasks: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, projectId: true, assignees: { select: { userId: true } } },
        },
      },
    });
    if (!full) throw new ApiError("Item not found", 404);

    // Notify SMM/POC + the item creator.
    const smm = await prisma.user.findMany({
      where: { organizationId: resolved.organizationId, isActive: true, designation: { in: ["SMM", "POC"] } },
      select: { id: true },
    });
    const notifyIds = [...smm.map((u) => u.id), full.createdById].filter(Boolean) as string[];

    if (action === "approve") {
      if (full.status === "CLIENT_APPROVED") return NextResponse.json({ success: true, unchanged: true });
      await prisma.contentItem.update({
        where: { id: itemId },
        data: { status: "CLIENT_APPROVED", clientApprovedAt: new Date() },
      });
      await logStatus({
        organizationId: resolved.organizationId,
        entityType: "CONTENT_ITEM",
        entityId: itemId,
        from: full.status,
        to: "CLIENT_APPROVED",
        userId: null,
        note: "via review link",
      });
      await notifyMany(notifyIds, {
        organizationId: resolved.organizationId,
        type: "CONTENT_CLIENT_APPROVED",
        title: `"${full.topic}" was approved by the client`,
        body: `${resolved.clientName} approved via the review link.`,
        link: `/clients/${resolved.clientId}?tab=content`,
      });
      return NextResponse.json({ success: true, status: "CLIENT_APPROVED" });
    }

    if (action === "request_changes") {
      if (!comment?.trim()) throw new ApiError("Please describe the changes you need", 400);
      const newestTask = full.tasks[0];
      if (newestTask) {
        await prisma.changeRequest.create({
          data: { taskId: newestTask.id, note: `Client (via review link): ${comment.trim()}` },
        });
        await prisma.task.update({ where: { id: newestTask.id }, data: { status: "IN_PROGRESS" } });
        await notifyMany(newestTask.assignees.map((a) => a.userId), {
          organizationId: resolved.organizationId,
          type: "TASK_CHANGES_REQUESTED",
          title: `Client requested changes on "${full.topic}"`,
          body: comment.trim().slice(0, 160),
          link: newestTask.projectId ? `/projects/${newestTask.projectId}?task=${newestTask.id}` : `/tasks?task=${newestTask.id}`,
        });
      }
      await prisma.contentItem.update({ where: { id: itemId }, data: { status: "IN_PROGRESS" } });
      await logStatus({
        organizationId: resolved.organizationId,
        entityType: "CONTENT_ITEM",
        entityId: itemId,
        from: full.status,
        to: "IN_PROGRESS",
        userId: null,
        note: `client requested changes via review link: ${comment.trim().slice(0, 120)}`,
      });
      await notifyMany(notifyIds, {
        organizationId: resolved.organizationId,
        type: "CONTENT_CHANGES_REQUESTED",
        title: `${resolved.clientName} requested changes on "${full.topic}"`,
        body: comment.trim().slice(0, 160),
        link: `/clients/${resolved.clientId}?tab=content`,
      });
      return NextResponse.json({ success: true, status: "IN_PROGRESS" });
    }

    throw new ApiError("Invalid action", 400);
  } catch (error) {
    return handleApiError(error, "POST /api/review/[token]");
  }
}
