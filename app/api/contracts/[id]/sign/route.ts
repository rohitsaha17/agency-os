import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// POST /api/contracts/[id]/sign — mark a party as signed
export async function POST(req: NextRequest, { params }: Params) {
  const { id: contractId } = await params;
  try {
    const { partyId, signatureNote } = await req.json();
    if (!partyId) return NextResponse.json({ error: "partyId is required" }, { status: 400 });

    await prisma.contractParty.update({
      where: { id: partyId },
      data: {
        signedAt: new Date(),
        signatureNote: signatureNote?.trim() || null,
      },
    });

    // Recompute contract status
    const allParties = await prisma.contractParty.findMany({ where: { contractId } });
    const signedCount = allParties.filter((p) => p.signedAt !== null).length;
    const newStatus =
      signedCount === 0 ? undefined :
      signedCount === allParties.length ? "FULLY_SIGNED" :
      "PARTIALLY_SIGNED";

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: newStatus ? { status: newStatus } : {},
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        parties: {
          include: {
            client: { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(contract);
  } catch (error) {
    console.error("[POST /api/contracts/[id]/sign]", error);
    return NextResponse.json({ error: "Failed to record signature" }, { status: 500 });
  }
}

// DELETE /api/contracts/[id]/sign — unsign a party
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: contractId } = await params;
  try {
    const { partyId } = await req.json();
    if (!partyId) return NextResponse.json({ error: "partyId is required" }, { status: 400 });

    await prisma.contractParty.update({
      where: { id: partyId },
      data: { signedAt: null, signatureNote: null },
    });

    const allParties = await prisma.contractParty.findMany({ where: { contractId } });
    const signedCount = allParties.filter((p) => p.signedAt !== null).length;
    const newStatus = signedCount === 0 ? "SENT" : "PARTIALLY_SIGNED";

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: { status: newStatus },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        parties: {
          include: {
            client: { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contract);
  } catch (error) {
    console.error("[DELETE /api/contracts/[id]/sign]", error);
    return NextResponse.json({ error: "Failed to remove signature" }, { status: 500 });
  }
}
