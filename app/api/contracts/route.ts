import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type          = searchParams.get("type");
  const status        = searchParams.get("status");
  const clientId      = searchParams.get("clientId");
  const projectId     = searchParams.get("projectId");
  const stakeholderId = searchParams.get("stakeholderId");
  const search        = searchParams.get("search");

  try {
    const contracts = await prisma.contract.findMany({
      where: {
        ...(type      ? { type:     type   as never } : {}),
        ...(status    ? { status:   status as never } : {}),
        ...(clientId  ? { clientId }  : {}),
        ...(projectId ? { projectId } : {}),
        ...(stakeholderId ? {
          parties: { some: { stakeholderId } },
        } : {}),
        ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        client:  { select: { id: true, name: true } },
        parties: {
          include: {
            client:      { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user:        { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contracts);
  } catch (error) {
    console.error("[GET /api/contracts]", error);
    return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, type, projectId, clientId, startDate, endDate, value, currency, notes, parties } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const contract = await prisma.contract.create({
      data: {
        title:     title.trim(),
        type:      type || "NDA",
        status:    "DRAFT",
        projectId: projectId || null,
        clientId:  clientId  || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate:   endDate   ? new Date(endDate)   : null,
        value:     value ? parseFloat(value) : null,
        currency:  currency || "USD",
        notes:     notes?.trim() || null,
        parties: {
          create: (parties || []).map((p: {
            partyType: string; clientId?: string; stakeholderId?: string;
            userId?: string; name: string; email?: string;
          }) => ({
            partyType:    p.partyType,
            clientId:     p.clientId      || null,
            stakeholderId: p.stakeholderId || null,
            userId:       p.userId         || null,
            name:         p.name,
            email:        p.email          || null,
          })),
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        client:  { select: { id: true, name: true } },
        parties: {
          include: {
            client:      { select: { id: true, name: true } },
            stakeholder: { select: { id: true, name: true, type: true } },
            user:        { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts]", error);
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }
}
