import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type    = searchParams.get("type");
  const search  = searchParams.get("search");
  const active  = searchParams.get("active");

  try {
    const stakeholders = await prisma.stakeholder.findMany({
      where: {
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
    console.error("[GET /api/stakeholders]", error);
    return NextResponse.json({ error: "Failed to load stakeholders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, role, email, phone, website, address, skills, currency, defaultRate, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const skillsArr = typeof skills === "string"
      ? skills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(skills) ? skills : []);

    const stakeholder = await prisma.stakeholder.create({
      data: {
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
    console.error("[POST /api/stakeholders]", error);
    return NextResponse.json({ error: "Failed to create stakeholder" }, { status: 500 });
  }
}
