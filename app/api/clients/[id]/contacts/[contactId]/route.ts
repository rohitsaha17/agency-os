import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; contactId: string }> };

// PATCH /api/clients/[id]/contacts/[contactId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, contactId } = await params;

  try {
    const body = await req.json();
    const { name, email, phone, jobTitle, isPrimary } = body;

    // If promoting to primary, demote all others
    if (isPrimary) {
      await prisma.clientContact.updateMany({
        where: { clientId: id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.clientContact.update({
      where: { id: contactId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(jobTitle !== undefined && { jobTitle: jobTitle?.trim() || null }),
        ...(isPrimary !== undefined && { isPrimary }),
      },
    });

    return NextResponse.json(contact);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    console.error("[PATCH contact]", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

// DELETE /api/clients/[id]/contacts/[contactId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { contactId } = await params;

  try {
    await prisma.clientContact.delete({ where: { id: contactId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    console.error("[DELETE contact]", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
