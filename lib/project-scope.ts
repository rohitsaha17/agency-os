/**
 * SMM own-project scope (QA-016).
 *
 * Kept in its own module (not lib/api-permissions) so that api-permissions stays
 * free of a prisma import — several build-time check scripts import
 * api-permissions purely for its pure functions and must not pull in the DB
 * client. These helpers do hit the DB, so they live here.
 *
 * The documented model (docs/V3_CONTEXT.md §2; lib/permissions.ts:442) scopes an
 * SMM's content.plan / tasks.review / cycles.close to projects they belong to.
 * Admin/Manager/Owner are unrestricted; TEAM lacks these caps entirely.
 */
import { prisma } from "./prisma";
import { requireCapability } from "./api-permissions";
import type { Capability, HasRole } from "./permissions";

/** Is this user an SMM member of the given project? (ProjectMember role SMM) */
export async function isProjectSmm(userId: string, projectId: string): Promise<boolean> {
  const m = await prisma.projectMember.findFirst({
    where: { projectId, userId, role: "SMM" },
    select: { userId: true },
  });
  return !!m;
}

/**
 * Enforce a project-scoped capability WITH the SMM own-project rule. `can()`
 * already understands `ownsProject`; the gap QA-016 fixes is that most routes
 * never computed and passed it, so any SMM could act on any project. This
 * computes it once and each project-scoped mutation route calls it instead of a
 * bare requireCapability.
 *
 * Scope only bites when the actor is an SMM AND there is a project to scope to;
 * a project-less (loose/ad-hoc) resource has no project to own, so it passes.
 */
export async function requireProjectCapability(
  user: HasRole & { id: string },
  capability: Capability,
  projectId: string | null | undefined,
): Promise<void> {
  const ownsProject =
    user.role === "SMM" && projectId ? await isProjectSmm(user.id, projectId) : true;
  requireCapability(user, capability, { ownsProject });
}
