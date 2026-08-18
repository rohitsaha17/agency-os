import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { ensureCreativeTypes } from "@/lib/content";

// GET /api/creative-types — org catalog (defaults seeded on first use).
// ?all=1 includes inactive types (settings screen).
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const all = req.nextUrl.searchParams.get("all") === "1";
    const types = await ensureCreativeTypes(user.organizationId);
    return NextResponse.json(all ? types : types.filter((t) => t.isActive));
  } catch (error) {
    return handleApiError(error, "GET /api/creative-types");
  }
}

// POST /api/creative-types — add a type (admins/managers)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const { name, icon, color, countsAsShoot } = await req.json();
    if (!name?.trim()) throw new ApiError("Name is required", 400);

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const dup = await prisma.creativeType.findFirst({
      where: { organizationId: user.organizationId, slug },
      select: { id: true },
    });
    if (dup) throw new ApiError("A creative type with this name already exists", 409);

    const last = await prisma.creativeType.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await prisma.creativeType.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        slug,
        icon: icon?.trim() || null,
        color: color?.trim() || null,
        countsAsShoot: !!countsAsShoot,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/creative-types");
  }
}
