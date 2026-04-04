import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const stakeholder = await prisma.stakeholder.findUnique({
      where: { id },
      include: {
        expenses: {
          orderBy: { date: "desc" },
          take: 20,
          include: { project: { select: { id: true, name: true } } },
        },
        contracts: {
          include: {
            contract: {
              select: { id: true, title: true, type: true, status: true, createdAt: true },
            },
          },
        },
        _count: { select: { expenses: true, contracts: true } },
      },
    });
    if (!stakeholder) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(stakeholder);
  } catch (error) {
    console.error("[GET /api/stakeholders/[id]]", error);
    return NextResponse.json({ error: "Failed to load stakeholder" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, type, role, email, phone, website, address, skills, currency, defaultRate, notes, isActive } = body;

    const skillsArr = typeof skills === "string"
      ? skills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(skills) ? skills : undefined);

    const stakeholder = await prisma.stakeholder.update({
      where: { id },
      data: {
        ...(name        !== undefined ? { name: name.trim() }                              : {}),
        ...(type        !== undefined ? { type }                                            : {}),
        ...(role        !== undefined ? { role: role || null }                              : {}),
        ...(email       !== undefined ? { email:   email?.trim()   || null }               : {}),
        ...(phone       !== undefined ? { phone:   phone?.trim()   || null }               : {}),
        ...(website     !== undefined ? { website: website?.trim() || null }               : {}),
        ...(address     !== undefined ? { address: address?.trim() || null }               : {}),
        ...(skillsArr   !== undefined ? { skills: skillsArr }                              : {}),
        ...(currency    !== undefined ? { currency }                                        : {}),
        ...(defaultRate !== undefined ? { defaultRate: defaultRate ? parseFloat(defaultRate) : null } : {}),
        ...(notes       !== undefined ? { notes: notes?.trim() || null }                   : {}),
        ...(isActive    !== undefined ? { isActive }                                        : {}),
      },
    });
    return NextResponse.json(stakeholder);
  } catch (error) {
    console.error("[PATCH /api/stakeholders/[id]]", error);
    return NextResponse.json({ error: "Failed to update stakeholder" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.stakeholder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/stakeholders/[id]]", error);
    return NextResponse.json({ error: "Failed to delete stakeholder" }, { status: 500 });
  }
}
