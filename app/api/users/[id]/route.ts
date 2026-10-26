import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { can } from "@/lib/permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

// v3: MEMBER is retired from the assignable set; TEAM replaces it.
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "SMM", "TEAM"] as const;

/**
 * Granting ADMIN is how someone gets the keys to everything, so it stays
 * with people who already hold them. users.manage is ADMIN/OWNER only today,
 * but this is checked explicitly rather than relying on that staying true.
 */
function assertMayGrant(caller: { role: string }, role: string | undefined) {
  if (role !== "ADMIN") return;
  if (caller.role !== "ADMIN" && caller.role !== "OWNER") {
    throw new ApiError("Only an admin can make someone else an admin", 403);
  }
}

type Actor = { id?: string; role?: string | null; organizationId?: string; organization?: { permissions?: unknown } | null };

/**
 * May `caller` deactivate or delete `target`?
 *
 * The capability (users.remove) is owner/admin/manager, but WHO each may touch
 * is narrower, and a delete is narrower still than a deactivation:
 *
 *   OWNER   can never be deactivated or deleted — by anyone.
 *   ADMIN   can never be DELETED — only deactivated, and only by an account
 *           admin (admin/owner), never a manager.
 *   MANAGER a manager may remove only SMMs and team members; an account admin
 *           may also remove managers.
 *   SELF    nobody deactivates or deletes their own account.
 */
function assertMayRemove(
  caller: Actor,
  target: { id: string; role: string },
  action: "deactivate" | "delete",
) {
  requireCapability(caller as never, "users.remove");
  const verb = action === "delete" ? "deleted" : "deactivated";

  if (target.role === "OWNER") {
    throw new ApiError(`The organization owner can't be ${verb}.`, 403);
  }
  if (caller.id === target.id) {
    throw new ApiError(`You can't ${action} your own account.`, 400);
  }
  if (action === "delete" && target.role === "ADMIN") {
    throw new ApiError("An admin account can't be deleted — deactivate it instead.", 403);
  }

  // An account admin (users.manage = admin/owner) may act on managers and
  // below. A manager (users.remove but not users.manage) is held to SMMs and
  // team members, so they can't remove a peer or anyone above them.
  const isAccountAdmin = can(caller as never, "users.manage");
  if (!isAccountAdmin && target.role !== "SMM" && target.role !== "TEAM") {
    throw new ApiError("A manager can only deactivate or remove SMMs and team members.", 403);
  }
}

const USER_FIELDS = {
  id: true, name: true, email: true, avatarUrl: true,
  role: true, isActive: true, createdAt: true,
  jobTitle: { select: { id: true, name: true, slug: true, canBeAssignedWork: true } },
} as const;

/** The contact details editable from Settings ▸ Team. Salary stays in Payroll. */
const PROFILE_FIELDS = {
  phone: true, address: true, dateOfBirth: true, dateOfJoining: true,
  emergencyName: true, emergencyPhone: true, notes: true,
} as const;

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new ApiError("That date is not valid", 400);
  return d;
}

// GET /api/users/[id] — one member with their contact details (for the edit form).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);
    // Reading another member's contact card is a managing act; your own is yours.
    if (caller.id !== id && !can(caller, "users.manage") && !can(caller, "hr.manage")) {
      throw new ApiError("You do not have permission to view this member", 403);
    }
    const user = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { ...USER_FIELDS, staffProfile: { select: PROFILE_FIELDS } },
    });
    if (!user) throw new ApiError("User not found", 404);
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "GET /api/users/[id]");
  }
}

// PATCH /api/users/[id] — edit profile/contact details, role, designation, active status.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);

    // Verify the target user belongs to the caller's organization.
    const existing = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { id: true, role: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

    const { name, email, role, isActive, avatarUrl, designationId, staffProfile } = await req.json();

    /*
      Three tiers of edit, each with its own gate:

      - name, avatar and contact details (phone, address, emergency contact,
        dates, notes) are PROFILE edits — an admin or a manager may do them for
        anyone, and anyone may do their own. This is the "admin or manager can
        edit a member's details" the product asked for.
      - email is a login identity, so it stays with the account managers
        (users.manage) or the person themselves.
      - role, active status and designation are privilege/lifecycle changes:
        users.manage only.
    */
    const isSelf = caller.id === id;
    const canManage = can(caller, "users.manage");           // admin / owner
    const canEditProfile = canManage || can(caller, "hr.manage") || isSelf; // + manager, + self

    // Role and designation are privilege changes (admin/owner). Active status
    // is a lifecycle change with its own, role-aware rule (admin or manager,
    // bounded by who they may touch) — see assertMayRemove.
    const touchesRoleOrDesignation = role !== undefined || designationId !== undefined;
    const touchesEmail = email !== undefined;
    const touchesProfile =
      name !== undefined || avatarUrl !== undefined || staffProfile !== undefined;

    if (touchesRoleOrDesignation) requireCapability(caller, "users.manage");
    if (isActive !== undefined) assertMayRemove(caller, existing, "deactivate");
    if (touchesEmail && !canManage && !isSelf) {
      throw new ApiError("Only an account manager can change a member's email", 403);
    }
    if (touchesProfile && !canEditProfile) {
      throw new ApiError("You do not have permission to edit this member", 403);
    }

    if (designationId) {
      const ok = await prisma.designationRole.findFirst({
        where: { id: designationId, organizationId: caller.organizationId },
        select: { id: true },
      });
      if (!ok) throw new ApiError("Invalid designation", 400);
    }
    if (role !== undefined) {
      if (existing.role === "OWNER") {
        throw new ApiError("The organization owner's role cannot be changed", 403);
      }
      if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError("Invalid role", 400);
      assertMayGrant(caller, role);
    }
    const normalizedEmail = email !== undefined ? String(email).trim().toLowerCase() : undefined;
    if (normalizedEmail) {
      const dup = await prisma.user.findFirst({
        where: { organizationId: caller.organizationId, email: normalizedEmail, NOT: { id } },
        select: { id: true },
      });
      if (dup) throw new ApiError("A user with this email already exists", 409);
    }

    // Contact details live on StaffProfile; upsert so a member who never had
    // one gets created on first edit.
    if (staffProfile !== undefined) {
      if (staffProfile === null || typeof staffProfile !== "object") {
        throw new ApiError("staffProfile must be an object", 400);
      }
      const p = staffProfile as Record<string, unknown>;
      const data = {
        ...(p.phone !== undefined && { phone: p.phone ? String(p.phone).trim() : null }),
        ...(p.address !== undefined && { address: p.address ? String(p.address).trim() : null }),
        ...(p.emergencyName !== undefined && { emergencyName: p.emergencyName ? String(p.emergencyName).trim() : null }),
        ...(p.emergencyPhone !== undefined && { emergencyPhone: p.emergencyPhone ? String(p.emergencyPhone).trim() : null }),
        ...(p.notes !== undefined && { notes: p.notes ? String(p.notes).trim() : null }),
        ...(p.dateOfBirth !== undefined && { dateOfBirth: parseDate(p.dateOfBirth) }),
        ...(p.dateOfJoining !== undefined && { dateOfJoining: parseDate(p.dateOfJoining) }),
      };
      await prisma.staffProfile.upsert({
        where: { userId: id },
        update: data,
        create: { organizationId: caller.organizationId, userId: id, ...data },
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name      !== undefined && { name: String(name).trim() }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(role      !== undefined && { role }),
        ...(isActive  !== undefined && { isActive }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(designationId !== undefined && { designationId: designationId || null }),
      },
      select: { ...USER_FIELDS, staffProfile: { select: PROFILE_FIELDS } },
    });

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "PATCH /api/users/[id]");
  }
}

/**
 * DELETE /api/users/[id] — permanently remove a member.
 *
 * This is a HARD delete, not a deactivation. Deactivation is reversible and is
 * done through PATCH { isActive: false }; it is the safe default and the only
 * thing most teams ever need. Hard delete is the escape hatch for a member who
 * should leave no trace, and it is deliberately gated behind that:
 *
 *   you can only delete a member who is already DEACTIVATED.
 *
 * So removing someone is always two deliberate steps — deactivate, then delete
 * — and an active person can never be erased in a single click.
 *
 * WHAT GOES AND WHAT STAYS
 *
 * The person's OWN data is removed with them (the schema cascades it): their
 * staff/contact profile, personal reminders, task-list columns, attendance,
 * leave requests, salary/advance records, notifications, stars, time entries,
 * channel memberships, availability, and their rows in the task-assignee join.
 *
 * The AGENCY's records are kept and simply lose the name: projects they
 * created, tasks they managed, status history they wrote, files they uploaded,
 * invoices, chat messages — the authorship is nulled (the schema sets those
 * foreign keys to null), so the work and its history survive without the
 * person. Deleting a member must not delete the agency's memory of the work.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const caller = await requireAuth(req);

    const existing = await prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      select: { id: true, role: true, isActive: true, name: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

    // Owner never, admin never (delete), manager only SMM/TEAM, not yourself.
    assertMayRemove(caller, existing, "delete");

    if (existing.isActive) {
      throw new ApiError(
        "Deactivate this member before deleting them permanently.",
        409,
      );
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (err) {
      // A foreign key we don't cascade/null would land here. Surface it clearly
      // rather than as a 500, and leave the member untouched.
      if ((err as { code?: string }).code === "P2003") {
        throw new ApiError(
          "This member is still linked to records that must be reassigned before they can be deleted.",
          409,
        );
      }
      throw err;
    }

    return NextResponse.json({ ok: true, deletedId: id, name: existing.name });
  } catch (error) {
    return handleApiError(error, "DELETE /api/users/[id]");
  }
}
