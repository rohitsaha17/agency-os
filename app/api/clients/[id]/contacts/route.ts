import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// Verify the parent client belongs to the caller's org.
async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) throw new ApiError("Client not found", 404);
}

// GET /api/clients/[id]/contacts
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireAuth(req);
    await assertClientInOrg(id, user.organizationId);

    const contacts = await prisma.clientContact.findMany({
      where: { clientId: id },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(contacts);
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]/contacts");
  }
}

// POST /api/clients/[id]/contacts — add a new contact
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireAuth(req);
    await assertClientInOrg(id, user.organizationId);

    const body = await req.json();
    const { name, email, phone, jobTitle, isPrimary } = body;

    if (!name?.trim()) {
      throw new ApiError("Contact name is required", 400);
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
    return handleApiError(error, "POST /api/clients/[id]/contacts");
  }
}
