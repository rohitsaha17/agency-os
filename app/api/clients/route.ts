import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/clients — list all clients with optional search + status filter
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? undefined;

  try {
    const clients = await prisma.client.findMany({
      where: {
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(status && { status: status as never }),
      },
      include: {
        contacts: {
          select: { id: true, name: true, jobTitle: true, isPrimary: true },
        },
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json(
      { error: "Database unavailable. Please configure PostgreSQL." },
      { status: 503 }
    );
  }
}

// POST /api/clients — create a new client
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name, companyName, email, phone, website,
      industry, address, links, brandColors, brandAssets,
      taxRegistrations, notes, status,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Client name is required" }, { status: 400 });
    }

    // Auto-derive logoUrl from logo-type link
    const logoUrl = Array.isArray(links)
      ? (links.find((l: { type: string; url: string }) => l.type === "logo")?.url ?? null)
      : null;

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        companyName: companyName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        industry: industry?.trim() || null,
        address: address?.trim() || null,
        logoUrl,
        links: links?.length ? links : undefined,
        brandColors: brandColors?.length ? brandColors : undefined,
        brandAssets: brandAssets?.length ? brandAssets : undefined,
        taxRegistrations: taxRegistrations?.length ? taxRegistrations : undefined,
        notes: notes?.trim() || null,
        status: status || "ACTIVE",
      },
      include: {
        contacts: true,
        _count: { select: { projects: true } },
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients]", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
