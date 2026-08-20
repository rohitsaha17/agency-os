import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { can } from "@/lib/permissions";

/**
 * GET /api/tasks/approvals — the reviewer's inbox.
 *
 * v3 turns this into the WORK-review queue: everything submitted and waiting
 * on this person, with the submission attached so they can judge it without
 * opening anything (docs/V3_CONTEXT.md §3).
 *
 * The v2 assignment-approval queue still appears when the org has the
 * Head-of-Design gate switched on, under `assignments`.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "tasks.review");

    // An SMM sees their own projects; admin and manager see everything, so
    // work is never stuck behind someone who's away.
    const seesEverything = can(user, "clients.manage");

    const [submitted, org] = await Promise.all([
      prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: "IN_REVIEW",
          ...(seesEverything
            ? {}
            : {
                OR: [
                  { approverId: user.id },
                  { project: { members: { some: { userId: user.id, role: "SMM" } } } },
                ],
              }),
        },
        include: {
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          client: { select: { id: true, name: true } },
          assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          contentItem: {
            select: {
              id: true, topic: true, date: true,
              creativeType: { select: { name: true, icon: true, color: true } },
            },
          },
          // The proof, so the reviewer can judge without leaving the inbox
          deliveries: {
            orderBy: { deliveredAt: "desc" },
            take: 1,
            include: {
              deliveredBy: { select: { id: true, name: true } },
              file: { select: { id: true, name: true, url: true, mimeType: true } },
            },
          },
        },
        orderBy: { submittedAt: "asc" },
      }),
      prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { requireAssignmentApproval: true },
      }),
    ]);

    // Only relevant while the Head-of-Design gate is on (Phase 1 made it
    // opt-in and off by default).
    const assignments = org?.requireAssignmentApproval
      ? await prisma.task.findMany({
          where: {
            organizationId: user.organizationId,
            deletedAt: null,
            assignmentStatus: "PENDING_HEAD_APPROVAL",
          },
          include: {
            project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
            client: { select: { id: true, name: true } },
            preferredAssignee: {
              select: { id: true, name: true, jobTitle: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    return NextResponse.json({ submitted, assignments });
  } catch (error) {
    return handleApiError(error, "GET /api/tasks/approvals");
  }
}
