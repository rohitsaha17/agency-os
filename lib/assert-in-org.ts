import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";

/**
 * Tenant guard for foreign keys that arrive in a request body.
 *
 * The pattern this closes: a route reads the caller's row with an
 * `organizationId` filter (so cross-tenant access to the *primary* object is a
 * 404), then trusts an id in the body — `clientId`, `cycleId`, `fileId`, a
 * user id — and writes it straight through. Those ids are attacker-controlled,
 * so a Gloo user could attach an Other Co client, file or user to their own
 * row: it pollutes the record and leaks the other tenant's name/email/URL
 * wherever the relation is later expanded.
 *
 * `assertInOrg` re-reads the referenced row scoped to the caller's org and
 * throws a 404 (the same "not yours to see" shape the primary lookups use) when
 * it isn't there. A null/empty id is a no-op — clearing a nullable FK is
 * legitimate and not a cross-tenant reference.
 *
 * Only add this where the audit found an UNSCOPED body FK. Where a route
 * already scopes the id (task `parentId`/`managerId`/`assigneeIds`, the
 * delivery task lookup — all CONFIRMED-SAFE in docs/QA_AUDIT_2026-09-29.md),
 * leave the existing check as it is: this is not a replacement for it.
 *
 * `via: "project"` covers a child that carries no `organizationId` column of
 * its own (a ProjectCycle) and must be scoped through its parent project.
 */
type DirectModel = "client" | "user" | "file" | "project" | "task" | "creativeType" | "contentItem";
type ViaProjectModel = "projectCycle";

export async function assertInOrg(
  model: DirectModel | ViaProjectModel,
  id: string | null | undefined,
  organizationId: string,
  opts?: { label?: string; via?: "project" },
): Promise<void> {
  // Not supplying the id, or clearing it, is not a cross-tenant reference.
  if (id === undefined || id === null || id === "") return;

  const where =
    opts?.via === "project"
      ? { id, project: { organizationId } }
      : { id, organizationId };

  // findFirst (not findUnique): the where carries the org filter, and for the
  // via-project case the parent relation, neither of which is the primary key.
  const row = await (prisma[model] as unknown as {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
  }).findFirst({ where, select: { id: true } });

  if (!row) {
    throw new ApiError(`${opts?.label ?? "Referenced item"} not found`, 404, "NOT_FOUND");
  }
}
