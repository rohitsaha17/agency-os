/**
 * v3 permission layer (docs/V3_CONTEXT.md §2).
 *
 * Permissions are expressed as CAPABILITIES, not role checks scattered
 * through components. A route asks `can(user, "projects.pricing")`; it never
 * asks `user.role === "ADMIN"`. That way the matrix lives in exactly one
 * place and Settings ▸ Roles can render it straight from this file, so the
 * documented matrix can't drift from the enforced one.
 *
 * Enforcement is ALWAYS server-side, in the API route handler. UI hiding is
 * a second layer and never the only one — see stripFinancials().
 */

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "SMM" | "TEAM" | "MEMBER";

export interface HasRole {
  id?: string;
  /** Optional so a half-loaded client-side user resolves to least privilege. */
  role?: string | null;
}

export type Capability =
  | "users.manage"
  | "settings.manage"
  | "clients.manage"
  | "projects.manage"
  | "projects.pricing"
  | "projects.assignSmm"
  | "content.plan"
  | "tasks.assign"
  | "tasks.review"
  | "cycles.close"
  | "billing.flag"
  | "financials.view"
  | "expenses.create"
  | "invoices.manage"
  | "reports.all"
  | "reports.delivery";

/** Who a role may hand work to. */
export type AssignScope = "anyone" | "smmAndBelow" | "juniorsOnly" | "selfOnly";

/**
 * MEMBER is the deprecated v2 tier. It resolves to TEAM so rows created
 * before the v3 migration behave sensibly if one is ever missed.
 */
function normalizeRole(role: string | null | undefined): Exclude<Role, "MEMBER"> {
  if (!role || role === "MEMBER") return "TEAM";
  if (role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "SMM" || role === "TEAM") {
    return role;
  }
  return "TEAM"; // unknown role → least privilege
}

/**
 * THE MATRIX. This is the single source of truth for docs/V3_CONTEXT.md §2.
 * OWNER is ADMIN plus immovability, so the two share a column.
 */
const MATRIX: Record<Exclude<Role, "MEMBER">, Record<Capability, boolean>> = {
  OWNER: {
    "users.manage": true, "settings.manage": true, "clients.manage": true, "projects.manage": true,
    "projects.pricing": true, "projects.assignSmm": true, "content.plan": true,
    "tasks.assign": true, "tasks.review": true, "cycles.close": true,
    "billing.flag": true, "financials.view": true, "expenses.create": true,
    "invoices.manage": true, "reports.all": true, "reports.delivery": true,
  },
  ADMIN: {
    "users.manage": true, "settings.manage": true, "clients.manage": true, "projects.manage": true,
    "projects.pricing": true, "projects.assignSmm": true, "content.plan": true,
    "tasks.assign": true, "tasks.review": true, "cycles.close": true,
    "billing.flag": true, "financials.view": true, "expenses.create": true,
    "invoices.manage": true, "reports.all": true, "reports.delivery": true,
  },
  MANAGER: {
    "users.manage": false, // read-only on Settings ▸ Users
    // The org profile, letterhead and creative types are a manager's to run;
    // only granting access isn't.
    "settings.manage": true,
    "clients.manage": true, "projects.manage": true,
    "projects.pricing": true, "projects.assignSmm": true, "content.plan": true,
    "tasks.assign": true, "tasks.review": true, "cycles.close": true,
    "billing.flag": true, "financials.view": true, "expenses.create": true,
    "invoices.manage": true,
    "reports.all": false, // no org P&L / revenue / margin
    "reports.delivery": true,
  },
  SMM: {
    "users.manage": false, "settings.manage": false, "clients.manage": false, "projects.manage": false,
    "projects.pricing": false, "projects.assignSmm": false,
    "content.plan": true, // own projects — scope checked by the caller
    "tasks.assign": true, // juniors only — see assignScope()
    "tasks.review": true, "cycles.close": true, "billing.flag": true,
    "financials.view": false, // THE money blackout
    "expenses.create": true, "invoices.manage": false,
    "reports.all": false, "reports.delivery": true, // own projects only
  },
  TEAM: {
    "users.manage": false, "settings.manage": false, "clients.manage": false, "projects.manage": false,
    "projects.pricing": false, "projects.assignSmm": false, "content.plan": false,
    "tasks.assign": false, // self-reminders only — see assignScope()
    "tasks.review": false, "cycles.close": false, "billing.flag": false,
    "financials.view": false,
    // They can file what they spent out of pocket — and see only their own.
    // Scoping lives in the expenses routes, not here.
    "expenses.create": true,
    "invoices.manage": false,
    "reports.all": false, "reports.delivery": false, // own tasks only
  },
};

const ASSIGN_SCOPE: Record<Exclude<Role, "MEMBER">, AssignScope> = {
  OWNER: "anyone",
  ADMIN: "anyone",
  MANAGER: "smmAndBelow",
  SMM: "juniorsOnly",
  TEAM: "selfOnly",
};

/** Roles a given actor is allowed to hand work to, by scope. */
const SCOPE_TARGETS: Record<AssignScope, Exclude<Role, "MEMBER">[]> = {
  anyone: ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"],
  smmAndBelow: ["SMM", "TEAM"],
  juniorsOnly: ["TEAM"],
  selfOnly: [],
};

/**
 * The one question every route should ask.
 *
 * `context` narrows capabilities that are scoped rather than absolute — e.g.
 * content.plan is true for an SMM, but only on a project they're on, which
 * the caller establishes and passes as `ownsProject`.
 */
export function can(
  user: HasRole | null | undefined,
  capability: Capability,
  context?: { ownsProject?: boolean },
): boolean {
  if (!user) return false;
  const role = normalizeRole(user.role);
  const allowed = MATRIX[role][capability];
  if (!allowed) return false;

  // SMM capabilities are scoped to projects they're assigned to. When the
  // caller tells us about ownership, honour it; when it says nothing, the
  // capability is granted and the route is expected to scope its own query.
  if (role === "SMM" && context?.ownsProject === false) {
    if (capability === "content.plan" || capability === "cycles.close" || capability === "tasks.review") {
      return false;
    }
  }
  return true;
}

/** How far down the org chart this user may delegate. */
export function assignScope(user: HasRole | null | undefined): AssignScope {
  if (!user) return "selfOnly";
  return ASSIGN_SCOPE[normalizeRole(user.role)];
}

/** May `actor` assign work to someone holding `targetRole`? */
export function canAssignTo(actor: HasRole | null | undefined, targetRole: string): boolean {
  if (!actor) return false;
  return SCOPE_TARGETS[assignScope(actor)].includes(normalizeRole(targetRole));
}

/**
 * May `actor` put this task on `target`'s plate?
 *
 * Same as canAssignTo, plus the case the role table can't express: yourself.
 * Every scope excludes the actor's own tier — juniorsOnly doesn't list SMM,
 * smmAndBelow doesn't list MANAGER — because those describe who you may
 * DELEGATE to. Writing your own to-do isn't delegation, and everyone can do
 * it, so it's answered here rather than by widening the scopes and
 * accidentally letting an SMM assign sideways to another SMM.
 */
export function canAssignToUser(
  actor: HasRole | null | undefined,
  target: { id?: string | null; role?: string | null },
): boolean {
  if (!actor) return false;
  if (actor.id && target.id && actor.id === target.id) return true;
  return canAssignTo(actor, target.role ?? "TEAM");
}

/** The whole matrix, for Settings ▸ Roles to render from code. */
export function capabilityMatrix() {
  return {
    roles: ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"] as const,
    capabilities: Object.keys(MATRIX.OWNER) as Capability[],
    matrix: MATRIX,
    assignScope: ASSIGN_SCOPE,
  };
}

// ── Convenience wrappers (kept from v2 so existing call sites keep working) ──

/** SMM and TEAM never see money: budgets, amounts, margins, billing. */
export function canViewFinancials(user: HasRole | null | undefined): boolean {
  return can(user, "financials.view");
}

/** Juniors never see client contact people / their emails & phones. */
export function canViewContacts(user: HasRole | null | undefined): boolean {
  const role = user ? normalizeRole(user.role) : "TEAM";
  return role !== "TEAM";
}

// ── The money blackout ───────────────────────────────────────────────────

/**
 * Every money-bearing field in the app. Anything named here is deleted from
 * a response when the caller lacks financials.view — the value never leaves
 * the server, so hiding it in the UI is defence in depth rather than the
 * only defence.
 */
const MONEY_FIELDS = new Set([
  "amount", "amountPaid", "balance", "billingAmount", "budget", "cycleAmount",
  "defaultRate", "discountValue", "expensesTotal", "invoicedTotal", "margin",
  "netMargin", "outstanding", "paidTotal", "pipelineValue", "revenue",
  "subtotal", "total", "unitPrice", "value",
]);

/**
 * Recursively strip money from any payload for users without financials.view.
 *
 * Deletes the key entirely rather than nulling it: a null still tells the
 * client a money field exists there, and "never return a number the user
 * isn't allowed to see" is easier to audit when the key is simply absent.
 * Dates and other class instances are passed through untouched.
 */
export function stripFinancials<T>(payload: T, user: HasRole | null | undefined): T {
  if (can(user, "financials.view")) return payload;
  return walk(payload) as T;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  // Prisma Decimal and similar wrappers aren't plain objects — leave them be;
  // they only appear as the VALUE of a money field, which we drop by key.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (MONEY_FIELDS.has(k)) continue;
    out[k] = walk(v);
  }
  return out;
}

/** Exported for the permission audit in Phase 8. */
export const MONEY_FIELD_NAMES = MONEY_FIELDS;
