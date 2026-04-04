import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

// GET /api/settings/company
export async function GET() {
  try {
    const settings = await prisma.companySettings.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[GET /api/settings/company]", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// PATCH /api/settings/company
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name, email, phone, website, address, city, country,
      logoUrl, currency, timezone, dateFormat,
      letterheadLogoUrl, letterheadHeader, letterheadFooter,
      letterheadAddress, letterheadPhone, letterheadEmail,
      letterheadWebsite, letterheadColor, letterheadTemplate,
    } = body;

    const settings = await prisma.companySettings.upsert({
      where:  { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        name:               name               ?? "My Agency",
        email:              email              ?? null,
        phone:              phone              ?? null,
        website:            website            ?? null,
        address:            address            ?? null,
        city:               city               ?? null,
        country:            country            ?? null,
        logoUrl:            logoUrl            ?? null,
        currency:           currency           ?? "USD",
        timezone:           timezone           ?? "UTC",
        dateFormat:         dateFormat         ?? "MMM D, YYYY",
        letterheadLogoUrl:  letterheadLogoUrl  ?? null,
        letterheadHeader:   letterheadHeader   ?? null,
        letterheadFooter:   letterheadFooter   ?? null,
        letterheadAddress:  letterheadAddress  ?? null,
        letterheadPhone:    letterheadPhone    ?? null,
        letterheadEmail:    letterheadEmail    ?? null,
        letterheadWebsite:  letterheadWebsite  ?? null,
        letterheadColor:    letterheadColor    ?? "#6366f1",
        letterheadTemplate: letterheadTemplate ?? "CLASSIC",
      },
      update: {
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
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("[PATCH /api/settings/company]", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
