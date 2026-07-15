import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

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
        role: true, isActive: true, createdAt: true,
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
    const { name, email, role } = await req.json();
    if (!name?.trim()) throw new ApiError("Name is required", 400);
    if (!email?.trim()) throw new ApiError("Email is required", 400);

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
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, isActive: true, createdAt: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/users");
  }
}
