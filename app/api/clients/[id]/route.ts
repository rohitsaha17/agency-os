import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonFor } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { canViewContacts } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id] — full client detail with contacts, files, projects
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireAuth(req);
    const client = await prisma.client.findFirst({
      where: { id, organizationId: user.organizationId },
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
      throw new ApiError("Client not found", 404);
    }

    // v2: MEMBERs never receive client contact people or contact fields.
    if (!canViewContacts(user)) {
      return jsonFor(user, {
        ...client,
        contacts: [],
        email: null,
        phone: null,
      });
    }

    return jsonFor(user, client);
  } catch (error) {
    return handleApiError(error, "GET /api/clients/[id]");
  }
}

// PATCH /api/clients/[id] — update client fields and primary contact
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      name, companyName, email, phone, jobTitle, website,
      industry, address, logoUrl, links, brandColors, brandAssets,
      taxRegistrations, notes, status, currency, importance,
    } = body;

    if (currency !== undefined && currency !== null && currency !== "" && typeof currency !== "string") {
      throw new ApiError("Currency must be a string", 400);
    }

    // Verify the client belongs to the caller's org before mutating.
    const existing = await prisma.client.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Client not found", 404);

    // Auto-derive logoUrl from logo-type link when links are updated
    const derivedLogoUrl = links !== undefined
      ? (Array.isArray(links) ? (links.find((l: { type: string; url: string }) => l.type === "logo")?.url ?? null) : null)
      : undefined;

    // companyName is the entity identifier — when it changes, mirror it onto
    // Client.name so the rest of the app (which reads `name`) stays in sync.
    // It can never be blanked out (that would leave a nameless client).
    if (companyName !== undefined && !companyName?.trim()) {
      throw new ApiError("Company name cannot be empty", 400);
    }
    const company = companyName !== undefined ? (companyName?.trim() || null) : undefined;
    const trimmedContactName = name !== undefined ? (name?.trim() || null) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.update({
        where: { id },
        data: {
          ...(company !== undefined && { name: company || "" /* keep in sync */, companyName: company }),
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
          // v2: empty string = inherit organization currency (stored as null)
          ...(currency !== undefined && { currency: currency?.trim() || null }),
          ...(importance !== undefined && { importance }),
        },
      });

      // Sync primary contact when any of its fields are sent
      const contactFieldsTouched =
        name !== undefined || email !== undefined ||
        phone !== undefined || jobTitle !== undefined;

      if (contactFieldsTouched) {
        const primary = await tx.clientContact.findFirst({
          where: { clientId: id, isPrimary: true },
        });

        const contactData = {
          ...(trimmedContactName !== undefined && trimmedContactName && { name: trimmedContactName }),
          ...(email !== undefined && { email: email?.trim() || null }),
          ...(phone !== undefined && { phone: phone?.trim() || null }),
          ...(jobTitle !== undefined && { jobTitle: jobTitle?.trim() || null }),
        };

        if (primary) {
          if (Object.keys(contactData).length > 0) {
            await tx.clientContact.update({
              where: { id: primary.id },
              data: contactData,
            });
          }
        } else if (trimmedContactName) {
          // No primary contact yet (legacy record) — create one
          await tx.clientContact.create({
            data: {
              clientId: id,
              name: trimmedContactName,
              email: email?.trim() || null,
              phone: phone?.trim() || null,
              jobTitle: jobTitle?.trim() || null,
              isPrimary: true,
            },
          });
        }
      }

      return tx.client.findUnique({
        where: { id: client.id },
        include: {
          contacts: true,
          _count: { select: { projects: true } },
        },
      });
    });

    return jsonFor(user, result);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Client not found", 404);
    }
    return handleApiError(error, "PATCH /api/clients/[id]");
  }
}

// DELETE /api/clients/[id] — archive (soft delete) the client
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireAuth(req);

    // Verify org ownership before archiving.
    const existing = await prisma.client.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Client not found", 404);

    await prisma.client.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return jsonFor(user, { success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2025") {
      return apiError("Client not found", 404);
    }
    return handleApiError(error, "DELETE /api/clients/[id]");
  }
}
