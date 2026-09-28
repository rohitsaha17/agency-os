import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import {
  capabilityMatrix, can, isGranted, parsePermissionOverrides, withOverride,
  isOverridableRole, isCapability, OVERRIDABLE_ROLES,
} from "@/lib/permissions";

/**
 * GET /api/permissions/matrix
 *
 * Settings ▸ Roles renders from this rather than a hand-maintained table, so
 * the documented matrix can never drift from the one lib/permissions.ts
 * actually enforces (docs/V3_CONTEXT.md §2).
 */

/** Human wording for each capability, kept next to the matrix it labels. */
const LABELS: Record<string, { label: string; group: string }> = {
  "users.manage":       { label: "Create & manage users",          group: "Administration" },
  "settings.manage":    { label: "Edit workspace settings",        group: "Administration" },
  "clients.manage":     { label: "Create & edit clients",          group: "Administration" },
  "projects.manage":    { label: "Create & edit projects",         group: "Projects" },
  "projects.pricing":   { label: "Set project amounts",            group: "Projects" },
  "projects.assignSmm": { label: "Assign an SMM to a project",     group: "Projects" },
  "content.plan":       { label: "Plan the content calendar",      group: "Work" },
  "tasks.assign":       { label: "Assign tasks",                   group: "Work" },
  "tasks.review":       { label: "Review & approve submitted work", group: "Work" },
  "cycles.close":       { label: "Close a cycle",                  group: "Work" },
  "billing.flag":       { label: "Flag extras as billable or free", group: "Money" },
  "financials.view":    { label: "See any money",                  group: "Money" },
  "expenses.create":    { label: "Add expenses",                   group: "Money" },
  "invoices.manage":    { label: "Create & send invoices",         group: "Money" },
  "reports.all":        { label: "All reports (incl. revenue)",    group: "Reporting" },
  "reports.delivery":   { label: "Delivery & deadline reports",    group: "Reporting" },
  // The HR half was unlabelled, so Settings ▸ Roles rendered the module's
  // most sensitive capabilities without saying what any of them opened.
  "attendance.mark":    { label: "Check in, and ask for leave",     group: "People" },
  "attendance.exempt":  { label: "Not required to check in",        group: "People" },
  "hr.today":           { label: "See who is in today",             group: "People" },
  "hr.records":         { label: "Attendance history & staff records", group: "People" },
  "hr.manage":          { label: "Edit staff records, decide leave", group: "People" },
  "payroll.manage":     { label: "Salaries, payroll & advances",    group: "People" },
};

const SCOPE_LABELS: Record<string, string> = {
  anyone: "Anyone",
  smmAndBelow: "SMM and below",
  juniorsOnly: "Juniors only",
  selfOnly: "Nobody (self only)",
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { roles, capabilities, assignScope } = capabilityMatrix();
    const overrides = parsePermissionOverrides(user.organization?.permissions);

    return NextResponse.json({
      roles,
      /** Which columns this page may edit. Owner and admin are never among them. */
      editableRoles: OVERRIDABLE_ROLES,
      /** Whether THIS viewer may edit them — the server checks again on write. */
      canEdit: can(user, "users.manage"),
      rows: capabilities.map((c) => ({
        capability: c,
        label: LABELS[c]?.label ?? c,
        group: LABELS[c]?.group ?? "Other",
        // The effective answer for this workspace, not the built-in default,
        // so the table keeps being the truth rather than a description of it.
        allowed: Object.fromEntries(roles.map((r) => [r, isGranted(r, c, overrides)])),
        /** Where this workspace has decided differently from the default. */
        changed: Object.fromEntries(
          roles.map((r) => [r, isOverridableRole(r) && overrides[r]?.[c] !== undefined]),
        ),
      })),
      assignScope: Object.fromEntries(
        roles.map((r) => [r, SCOPE_LABELS[assignScope[r]] ?? assignScope[r]]),
      ),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/permissions/matrix");
  }
}

/**
 * PATCH /api/permissions/matrix — move one capability for one role.
 *
 * GATED ON users.manage, NOT settings.manage
 *
 * settings.manage includes MANAGER, and a manager who can edit this table can
 * grant themselves everything on it. Deciding what other people may do is an
 * administrator's act, so it takes the capability only owners and admins hold
 * — and which, being theirs by code rather than by data, they cannot lose.
 *
 * One cell per request. The whole table would mean read-modify-write over a
 * JSON column, where two administrators editing at once silently discard each
 * other's change; a single toggle inside a transaction cannot.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");

    const body = await req.json().catch(() => ({}));
    const role = typeof body?.role === "string" ? body.role : "";
    const capability = typeof body?.capability === "string" ? body.capability : "";
    const allowed = body?.allowed;

    if (!isOverridableRole(role)) {
      return apiError(
        "Owner and admin always hold every capability, and cannot be changed here.",
        400,
      );
    }
    if (!isCapability(capability)) return apiError("No such capability", 400);
    if (typeof allowed !== "boolean") return apiError("allowed must be true or false", 400);

    const updated = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: user.organizationId },
        select: { permissions: true },
      });
      if (!org) throw new ApiError("Workspace not found", 404);

      const next = withOverride(
        parsePermissionOverrides(org.permissions),
        role,
        capability,
        allowed,
      );
      await tx.organization.update({
        where: { id: user.organizationId },
        data: { permissions: next as object },
      });
      return next;
    });

    return NextResponse.json({
      role,
      capability,
      allowed,
      /** True while this differs from the built-in default. */
      changed: updated[role]?.[capability] !== undefined,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/permissions/matrix");
  }
}
