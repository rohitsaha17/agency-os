import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

// The CompanySettings model was removed in the multi-tenant migration.
// This route now reads/writes the caller's Organization row instead —
// kept at the same URL so existing frontend fetches (settings page,
// PDF letterhead generator) continue to work without changes.

// GET /api/settings/company — the caller's organization
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
    if (!org) throw new ApiError("Organization not found", 404);
    return NextResponse.json(org);
  } catch (error) {
    return handleApiError(error, "GET /api/settings/company");
  }
}

// PATCH /api/settings/company — update the caller's organization
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      name, email, phone, website, address, city, country,
      logoUrl, currency, timezone, dateFormat,
      letterheadLogoUrl, letterheadHeader, letterheadFooter,
      letterheadAddress, letterheadPhone, letterheadEmail,
      letterheadWebsite, letterheadColor, letterheadTemplate, letterheadConfig,
    } = body;

    const settings = await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...(name               !== undefined && { name }),
        ...(email              !== undefined && { email }),
        ...(phone              !== undefined && { phone }),
        ...(website            !== undefined && { website }),
        ...(address            !== undefined && { address }),
        ...(city               !== undefined && { city }),
        ...(country            !== undefined && { country }),
        ...(logoUrl            !== undefined && { logoUrl }),
        ...(currency           !== undefined && { currency }),
        ...(timezone           !== undefined && { timezone }),
        ...(dateFormat         !== undefined && { dateFormat }),
        ...(letterheadLogoUrl  !== undefined && { letterheadLogoUrl }),
        ...(letterheadHeader   !== undefined && { letterheadHeader }),
        ...(letterheadFooter   !== undefined && { letterheadFooter }),
        ...(letterheadAddress  !== undefined && { letterheadAddress }),
        ...(letterheadPhone    !== undefined && { letterheadPhone }),
        ...(letterheadEmail    !== undefined && { letterheadEmail }),
        ...(letterheadWebsite  !== undefined && { letterheadWebsite }),
        ...(letterheadColor    !== undefined && { letterheadColor }),
        ...(letterheadTemplate !== undefined && { letterheadTemplate }),
        ...(letterheadConfig   !== undefined && { letterheadConfig }),
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "PATCH /api/settings/company");
  }
}
