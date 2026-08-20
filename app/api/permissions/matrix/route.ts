import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { capabilityMatrix } from "@/lib/permissions";

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
};

const SCOPE_LABELS: Record<string, string> = {
  anyone: "Anyone",
  smmAndBelow: "SMM and below",
  juniorsOnly: "Juniors only",
  selfOnly: "Nobody (self only)",
};

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { roles, capabilities, matrix, assignScope } = capabilityMatrix();

    return NextResponse.json({
      roles,
      rows: capabilities.map((c) => ({
        capability: c,
        label: LABELS[c]?.label ?? c,
        group: LABELS[c]?.group ?? "Other",
        allowed: Object.fromEntries(roles.map((r) => [r, matrix[r][c]])),
      })),
      assignScope: Object.fromEntries(
        roles.map((r) => [r, SCOPE_LABELS[assignScope[r]] ?? assignScope[r]]),
      ),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/permissions/matrix");
  }
}
