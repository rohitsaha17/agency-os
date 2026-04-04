import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id] — full client detail with contacts, files, projects
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        files: { orderBy: { createdAt: "desc" } },
        projects: {
          select: {
            id: true, name: true, status: true, type: true,
            startDate: true, endDate: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { projects: true } },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("[GET /api/clients/[id]]", error);
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }
}

// PATCH /api/clients/[id] — update client fields
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json();
    const {
      name, companyName, email, phone, website,
      industry, address, logoUrl, links, brandColors, brandAssets,
      taxRegistrations, notes, status,
    } = body;

    // Auto-derive logoUrl from logo-type link when links are updated
    const derivedLogoUrl = links !== undefined
      ? (Array.isArray(links) ? (links.find((l: { type: string; url: string }) => l.type === "logo")?.url ?? null) : null)
      : undefined;

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(companyName !== undefined && { companyName: companyName?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(website !== undefined && { website: website?.trim() || null }),
        ...(industry !== undefined && { industry: industry?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(links !== undefined && { links }),
        ...(derivedLogoUrl !== undefined && { logoUrl: derivedLogoUrl }),
        ...(logoUrl !== undefined && links === undefined && { logoUrl: logoUrl?.trim() || null }),
        ...(brandColors !== undefined && { brandColors }),
        ...(brandAssets !== undefined && { brandAssets }),
        ...(taxRegistrations !== undefined && { taxRegistrations }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(status !== undefined && { status }),
      },
      include: {
        contacts: true,
        _count: { select: { projects: true } },
      },
    });

    return NextResponse.json(client);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("[PATCH /api/clients/[id]]", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

// DELETE /api/clients/[id] — archive (soft delete) the client
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.client.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("[DELETE /api/clients/[id]]", error);
    return NextResponse.json({ error: "Failed to archive client" }, { status: 500 });
  }
}
