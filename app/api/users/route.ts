import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// Roles that can be granted to invited teammates. OWNER is never
// assignable — it belongs to the account created at tenant setup.
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;

// v2 job labels — routing & report targeting, not permissions.
const DESIGNATIONS = [
  "SMM", "DESIGNER", "EDITOR", "HEAD_OF_DESIGN",
  "PHOTOGRAPHER", "SME", "POC", "OTHER",
] as const;

// GET /api/users
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const users = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, designation: true, isActive: true, createdAt: true,
      },
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
    requireRole(user, ["ADMIN"]);
    const { name, email, role, designation } = await req.json();
    if (!name?.trim()) throw new ApiError("Name is required", 400);
    if (!email?.trim()) throw new ApiError("Email is required", 400);
    if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) {
      throw new ApiError("Invalid role", 400);
    }
    if (designation != null && !DESIGNATIONS.includes(designation)) {
      throw new ApiError("Invalid designation", 400);
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
        role:  role ?? "MEMBER",
        designation: designation ?? null,
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, designation: true, isActive: true, createdAt: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/users");
  }
}
