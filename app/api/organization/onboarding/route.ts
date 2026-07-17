import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * POST /api/organization/onboarding — complete first-run setup.
 *
 * Called from the /onboarding form by the org OWNER (or ADMIN). Saves the
 * agency profile, seeds the letterhead fields from it (so PDFs work
 * immediately), and flips `onboardingCompleted` to unlock the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["OWNER", "ADMIN"]);

    const body = await req.json();
    const {
      name, email, phone, website, address, city, country,
      currency, timezone, logoUrl, taxRegistrations,
    } = body;

    const orgName = (name ?? "").toString().trim();
    if (!orgName) throw new ApiError("Agency name is required", 400);

    const addressBlock = [address, city, country]
      .map((s: unknown) => (s ?? "").toString().trim())
      .filter(Boolean)
      .join(", ");

    const org = await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        name: orgName,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        country: country?.trim() || null,
        currency: currency || "USD",
        timezone: timezone || "UTC",
        logoUrl: logoUrl?.trim() || null,
        taxRegistrations: Array.isArray(taxRegistrations) && taxRegistrations.length
          ? taxRegistrations
          : undefined,
        // Seed letterhead from the profile so PDFs work out of the box.
        letterheadHeader: orgName,
        letterheadLogoUrl: logoUrl?.trim() || null,
        letterheadEmail: email?.trim() || null,
        letterheadPhone: phone?.trim() || null,
        letterheadWebsite: website?.trim() || null,
        letterheadAddress: addressBlock || null,
        onboardingCompleted: true,
        onboardedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, organization: { id: org.id, name: org.name } });
  } catch (err) {
    return handleApiError(err, "POST /api/organization/onboarding");
  }
}
