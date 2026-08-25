/**
 * v3 — capability enforcement for API route handlers.
 *
 * Server-side is the enforcement point (docs/V3_CONTEXT.md Prime Directive),
 * so routes should reach for these two helpers rather than checking roles:
 *
 *   requireCapability(user, "invoices.manage")   // 403 if not allowed
 *   return jsonFor(user, payload)                // strips money on the way out
 *
 * Kept separate from lib/permissions.ts because that module is imported by
 * client components too, and must not pull in next/server.
 */
import { NextResponse } from "next/server";
import { ApiError } from "./api-errors";
import { can, stripFinancials, type Capability, type HasRole } from "./permissions";

/** Throws ApiError(403) unless the user holds the capability. */
export function requireCapability(
  user: HasRole,
  capability: Capability,
  context?: { ownsProject?: boolean },
): void {
  if (!can(user, capability, context)) {
    throw new ApiError(
      "You do not have permission to perform this action",
      403,
      "FORBIDDEN",
    );
  }
}

/**
 * NextResponse.json, with every money field removed for users who lack
 * financials.view. Use this INSTEAD of NextResponse.json on any route whose
 * payload can carry an amount — the value then never leaves the server.
 */
export function jsonFor<T>(
  user: HasRole | null | undefined,
  data: T,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(stripFinancials(data, user), init);
}

/**
 * A Prisma `where` fragment limiting a task list to what this person should
 * see — the org chart expressed as a query.
 *
 * Admin and manager see the whole board; that's the job. An SMM sees the
 * projects they plan and anything routed to them. Everyone else sees the work
 * they were actually given, and not a list of what their colleagues are up to.
 *
 * Returns `{}` for the unrestricted case so it can be spread unconditionally.
 * Combine with AND, never by spreading into a `where` that already has an OR.
 */
export function taskVisibilityScope(user: { id: string; role?: string | null }) {
  if (can(user, "projects.manage")) return {};

  const mine = [
    { assignees: { some: { userId: user.id } } },
    { managerId: user.id },
  ];

  if (can(user, "content.plan")) {
    return {
      OR: [
        ...mine,
        { approverId: user.id },
        { project: { members: { some: { userId: user.id, role: "SMM" as const } } } },
      ],
    };
  }

  return { OR: mine };
}

/**
 * May this person export a task sheet for `requested`?
 *
 * `requested` is a user id, the literal "all", or "" meaning "me".
 *
 * Separate from `taskVisibilityScope` on purpose. That decides which rows the
 * database will return; this decides whose NAME may go at the top of a
 * document. Without it a junior could ask for a colleague and receive an empty
 * sheet titled with their colleague's name — not a data leak, but a document
 * that misrepresents itself, which is its own kind of harm.
 *
 * Exported so the rule can be tested directly rather than only through a
 * request.
 */
export function mayExportTasksFor(
  user: { id: string; role?: string | null },
  requested: string,
): boolean {
  const wantsOthers = requested === "all" || (!!requested && requested !== user.id);
  return !wantsOthers || can(user, "projects.manage");
}
