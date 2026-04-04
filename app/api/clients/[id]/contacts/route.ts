import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/contacts
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: id },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("[GET /api/clients/[id]/contacts]", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/clients/[id]/contacts — add a new contact
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { name, email, phone, jobTitle, isPrimary } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
    }

    // If this is a primary contact, demote existing primary
    if (isPrimary) {
      await prisma.clientContact.updateMany({
        where: { clientId: id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.clientContact.create({
      data: {
        clientId: id,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        jobTitle: jobTitle?.trim() || null,
        isPrimary: isPrimary ?? false,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients/[id]/contacts]", error);
    return NextResponse.json({ error: "Failed to add contact" }, { status: 500 });
  }
}
