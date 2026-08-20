import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

// Roles that can be granted to invited teammates. OWNER is never
// assignable — it belongs to the account created at tenant setup.
// v3: MEMBER is gone from this list; TEAM replaces it.
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "SMM", "TEAM"] as const;

const USER_FIELDS = {
  id: true, name: true, email: true, avatarUrl: true,
  role: true, isActive: true, createdAt: true,
  // v3: the job label is a row now, not an enum
  jobTitle: { select: { id: true, name: true, slug: true, canBeAssignedWork: true } },
} as const;

// GET /api/users
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const designationId = searchParams.get("designationId");
    // Assignment pickers ask for "people I can hand work to"
    const assignableOnly = searchParams.get("assignableOnly") === "1";

    const users = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(designationId ? { designationId } : {}),
        ...(assignableOnly ? { jobTitle: { canBeAssignedWork: true, isActive: true } } : {}),
      },
      select: USER_FIELDS,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error, "GET /api/users");
  }
}

// POST /api/users — create / invite a new team member (into the caller's org)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");
    const { name, email, role, designationId } = await req.json();
    if (!name?.trim()) throw new ApiError("Name is required", 400);
    if (!email?.trim()) throw new ApiError("Email is required", 400);
    if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) {
      throw new ApiError("Invalid role", 400);
    }
    if (designationId) {
      const ok = await prisma.designationRole.findFirst({
        where: { id: designationId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!ok) throw new ApiError("Invalid designation", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Uniqueness is scoped per organization (see @@unique in schema).
    const existing = await prisma.user.findFirst({
      where: { organizationId: user.organizationId, email: normalizedEmail },
      select: { id: true },
    });
    if (existing) throw new ApiError("A user with this email already exists", 409);

    const created = await prisma.user.create({
      data: {
        organizationId: user.organizationId,
        name:  name.trim(),
        email: normalizedEmail,
        role:  role ?? "TEAM",
        designationId: designationId ?? null,
      },
      select: USER_FIELDS,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/users");
  }
}
