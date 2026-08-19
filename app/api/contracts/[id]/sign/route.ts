import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function assertContractInOrg(contractId: string, organizationId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true },
  });
  if (!contract) throw new ApiError("Contract not found", 404);
}

// POST /api/contracts/[id]/sign — mark a party as signed
export async function POST(req: NextRequest, { params }: Params) {
  const { id: contractId } = await params;
  try {
    const user = await requireAuth(req);
    await assertContractInOrg(contractId, user.organizationId);

    const { partyId, signatureNote } = await req.json();
    if (!partyId) throw new ApiError("partyId is required", 400);

    // Verify the party belongs to THIS contract.
    const party = await prisma.contractParty.findFirst({
      where: { id: partyId, contractId },
      select: { id: true },
    });
    if (!party) throw new ApiError("Party not found", 404);

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
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(contract);
  } catch (error) {
    return handleApiError(error, "POST /api/contracts/[id]/sign");
  }
}

// DELETE /api/contracts/[id]/sign — unsign a party
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: contractId } = await params;
  try {
    const user = await requireAuth(req);
    await assertContractInOrg(contractId, user.organizationId);

    const { partyId } = await req.json();
    if (!partyId) throw new ApiError("partyId is required", 400);

    const party = await prisma.contractParty.findFirst({
      where: { id: partyId, contractId },
      select: { id: true },
    });
    if (!party) throw new ApiError("Party not found", 404);

    await prisma.contractParty.update({
      where: { id: partyId },
      data: { signedAt: null, signatureNote: null },
    });

    const allParties = await prisma.contractParty.findMany({ where: { contractId } });
    const signedCount = allParties.filter((p) => p.signedAt !== null).length;
    // Undoing the only signature must not promote a DRAFT contract to SENT.
    const current = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { status: true },
    });
    const newStatus =
      signedCount > 0 ? "PARTIALLY_SIGNED"
      : current?.status === "DRAFT" ? "DRAFT"
      : "SENT";

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: { status: newStatus },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        parties: {
          include: {
            client: { select: { id: true, name: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contract);
  } catch (error) {
    return handleApiError(error, "DELETE /api/contracts/[id]/sign");
  }
}
