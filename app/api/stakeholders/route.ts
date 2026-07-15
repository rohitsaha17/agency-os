import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type    = searchParams.get("type");
  const search  = searchParams.get("search");
  const active  = searchParams.get("active");

  try {
    const user = await requireAuth(req);
    const stakeholders = await prisma.stakeholder.findMany({
      where: {
        organizationId: user.organizationId,
        ...(type ? { type: type as "FREELANCER" | "AGENCY" | "VENDOR" | "INTERNAL_TEAM" } : {}),
        ...(active !== null ? { isActive: active === "true" } : {}),
        ...(search ? {
          OR: [
            { name:  { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { expenses: true, contracts: true } },
      },
    });
    return NextResponse.json(stakeholders);
  } catch (error) {
    return handleApiError(error, "GET /api/stakeholders");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { name, type, role, email, phone, website, address, skills, currency, defaultRate, notes } = body;

    if (!name?.trim()) {
      throw new ApiError("Name is required", 400);
    }

    const skillsArr = typeof skills === "string"
      ? skills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(skills) ? skills : []);

    const stakeholder = await prisma.stakeholder.create({
      data: {
        organizationId: user.organizationId,
        name:        name.trim(),
        type:        type || "FREELANCER",
        role:        role || null,
        email:       email?.trim()   || null,
        phone:       phone?.trim()   || null,
        website:     website?.trim() || null,
        address:     address?.trim() || null,
        skills:      skillsArr,
        currency:    currency || "USD",
        defaultRate: defaultRate ? parseFloat(defaultRate) : null,
        notes:       notes?.trim() || null,
      },
    });

    return NextResponse.json(stakeholder, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/stakeholders");
  }
}
