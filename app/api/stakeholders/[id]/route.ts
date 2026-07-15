import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const stakeholder = await prisma.stakeholder.findFirst({
      where: { id, organizationId: user.organizationId },
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
    if (!stakeholder) throw new ApiError("Not found", 404);
    return NextResponse.json(stakeholder);
  } catch (error) {
    return handleApiError(error, "GET /api/stakeholders/[id]");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.stakeholder.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

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
    return handleApiError(error, "PATCH /api/stakeholders/[id]");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const user = await requireAuth(req);
    const existing = await prisma.stakeholder.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Not found", 404);

    await prisma.stakeholder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/stakeholders/[id]");
  }
}
