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
