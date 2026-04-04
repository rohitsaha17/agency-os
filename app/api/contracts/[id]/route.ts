import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const CONTRACT_INCLUDE = {
  project: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  parties: {
    include: {
      client: { select: { id: true, name: true } },
      stakeholder: { select: { id: true, name: true, type: true } },
      user: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(contract);
  } catch (error) {
    console.error("[GET /api/contracts/[id]]", error);
    return NextResponse.json({ error: "Failed to load contract" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { title, type, status, projectId, clientId, fileId, startDate, endDate, value, currency, notes } = body;

    const contract = await prisma.contract.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...(clientId !== undefined ? { clientId: clientId || null } : {}),
        ...(fileId !== undefined ? { fileId: fileId || null } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(value !== undefined ? { value: value ? parseFloat(value) : null } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: CONTRACT_INCLUDE,
    });
    return NextResponse.json(contract);
  } catch (error) {
    console.error("[PATCH /api/contracts/[id]]", error);
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/contracts/[id]]", error);
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
  }
}
