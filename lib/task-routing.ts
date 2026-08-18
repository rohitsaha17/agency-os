import { prisma } from "@/lib/prisma";
import { isHeadOfDesign, AuthUser } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";

/**
 * v2 preferred-assignee routing (docs/V2_CONTEXT.md):
 * a non-head, non-admin creator naming a preferred editor/designer sends the
 * task through the Head-of-Design queue instead of assigning directly.
 */
export function resolveRouting(
  user: AuthUser,
  preferredAssigneeId: string | null | undefined,
  assigneeIds: string[] | undefined,
): { assignmentStatus: "NONE" | "PENDING_HEAD_APPROVAL"; assigneeIds: string[] } {
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
      OR: [{ designation: "HEAD_OF_DESIGN" }, { role: { in: ["ADMIN", "OWNER"] } }],
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
