// v2 permission rules (docs/V2_CONTEXT.md §4).
//
// Permission tiers stay OWNER/ADMIN/MANAGER/MEMBER. These helpers answer the
// two hard visibility rules; API route handlers are the enforcement point
// (strip fields server-side), UI hiding is a second layer only.

export interface HasRole {
  role: string;
}

/** MEMBER never sees money: budgets, amounts, margins, billing. */
export function canViewFinancials(user: HasRole | null | undefined): boolean {
  return !!user && user.role !== "MEMBER";
}

/** MEMBER never sees client contact people / their emails & phones. */
export function canViewContacts(user: HasRole | null | undefined): boolean {
  return !!user && user.role !== "MEMBER";
}
