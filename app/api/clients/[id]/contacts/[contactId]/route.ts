import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string; contactId: string }> };

async function assertContactInOrg(
  contactId: string,
  clientId: string,
  organizationId: string
) {
  const contact = await prisma.clientContact.findFirst({
    where: { id: contactId, clientId, client: { organizationId } },
    select: { id: true },
  });
  if (!contact) throw new ApiError("Contact not found", 404);
}

// PATCH /api/clients/[id]/contacts/[contactId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, contactId } = await params;

  try {
    const user = await requireAuth(req);
    await assertContactInOrg(contactId, id, user.organizationId);

    const body = await req.json();
    const { name, email, phone, jobTitle, isPrimary } = body;

    if (name !== undefined && !name?.trim()) {
      throw new ApiError("Contact name cannot be empty", 400);
    }

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
  } catch (error) {
    return handleApiError(error, "PATCH /api/clients/[id]/contacts/[contactId]");
  }
}

// DELETE /api/clients/[id]/contacts/[contactId]
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, contactId } = await params;

  try {
    const user = await requireAuth(req);
    await assertContactInOrg(contactId, id, user.organizationId);

    await prisma.clientContact.delete({ where: { id: contactId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/clients/[id]/contacts/[contactId]");
  }
}
