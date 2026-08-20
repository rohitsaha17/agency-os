import { prisma } from "@/lib/prisma";
import { isHeadOfDesign, AuthUser } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";

/**
 * Preferred-assignee routing.
 *
 * v2 always sent a non-head's preferred assignee through the Head-of-Design
 * queue. v3 makes that opt-in: `Organization.requireAssignmentApproval`
 * defaults to FALSE, so assigning normally reaches the assignee immediately
 * and the Approvals queue is left for work review (docs/V3_CONTEXT.md §4).
 *
 * Callers await `assignmentRequiresApproval(orgId)` and pass the result in,
 * so this stays a pure function.
 */
export function resolveRouting(
  user: AuthUser,
  preferredAssigneeId: string | null | undefined,
  assigneeIds: string[] | undefined,
  requireApproval = false,
): { assignmentStatus: "NONE" | "PENDING_HEAD_APPROVAL"; assigneeIds: string[] } {
  // The gate is off (the v3 default): a preferred assignee IS the assignee.
  if (!requireApproval) {
    const ids = new Set(assigneeIds ?? []);
    if (preferredAssigneeId) ids.add(preferredAssigneeId);
    return { assignmentStatus: "NONE", assigneeIds: [...ids] };
  }

  if (preferredAssigneeId && !isHeadOfDesign(user)) {
    return { assignmentStatus: "PENDING_HEAD_APPROVAL", assigneeIds: [] };
  }
  // Heads/admins with a preference just assign that person directly.
  if (preferredAssigneeId && isHeadOfDesign(user)) {
    const ids = new Set(assigneeIds ?? []);
    ids.add(preferredAssigneeId);
    return { assignmentStatus: "NONE", assigneeIds: [...ids] };
  }
  return { assignmentStatus: "NONE", assigneeIds: assigneeIds ?? [] };
}

/** Is the Head-of-Design assignment gate switched on for this organization? */
export async function assignmentRequiresApproval(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { requireAssignmentApproval: true },
  });
  return org?.requireAssignmentApproval ?? false;
}

/** Notify every Head-of-Design (+ admins/owner) about a pending approval. */
export async function notifyHeads(
  organizationId: string,
  title: string,
  link: string,
): Promise<void> {
  const heads = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        // v3: the job label is a row now; the old enum still matches legacy rows
        { jobTitle: { slug: "head-of-design" } },
        { designation: "HEAD_OF_DESIGN" },
        { role: { in: ["ADMIN", "OWNER"] } },
      ],
    },
    select: { id: true },
  });
  await notifyMany(heads.map((h) => h.id), {
    organizationId,
    type: "TASK_PENDING_APPROVAL",
    title,
    link,
  });
}
