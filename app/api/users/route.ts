import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/users
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const users = await prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, isActive: true, createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/users — create / invite a new team member
export async function POST(req: NextRequest) {
  try {
    const { name, email, role } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        name:  name.trim(),
        email: email.trim().toLowerCase(),
        role:  role ?? "MEMBER",
      },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        role: true, isActive: true, createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("[POST /api/users]", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
