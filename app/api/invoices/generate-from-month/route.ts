import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// GET /api/invoices/generate-from-month?clientId=&month=YYYY-MM
// Prefill lines for the "Generate from month" invoice mode:
//   (a) PACKAGE line from the active ClientPackage
//   (b) one EXTRA line per delivered (POSTED) extra/ad-hoc content item that
//       month with invoicedInId null — unit price from a rate card whose
//       service name matches the creative type (case-insensitive), else 0.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireRole(user, ["ADMIN", "MANAGER"]);
    const sp = req.nextUrl.searchParams;
    const clientId = sp.get("clientId");
    const month = sp.get("month");
    if (!clientId) throw new ApiError("clientId is required", 400);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ApiError("month must be YYYY-MM", 400);

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      select: { id: true, currency: true, organization: { select: { currency: true } } },
    });
    if (!client) throw new ApiError("Client not found", 404);

    const [y, m] = month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const [pkg, extras, rateCards] = await Promise.all([
      prisma.clientPackage.findFirst({
        where: {
          organizationId: user.organizationId, clientId, isActive: true,
          startMonth: { lte: from },
          OR: [{ endMonth: null }, { endMonth: { gte: from } }],
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contentItem.findMany({
        where: {
          organizationId: user.organizationId,
          clientId,
          date: { gte: from, lt: to },
          status: "POSTED",
          invoicedInId: null,
          OR: [{ isExtra: true }, { isAdHoc: true }],
        },
        include: { creativeType: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.rateCard.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { name: true, unitPrice: true },
      }),
    ]);

    const rateByName = new Map(
      rateCards.map((r) => [r.name.trim().toLowerCase(), Number(r.unitPrice)]),
    );

    const monthLabel = `${MONTH_NAMES[m - 1]} ${y}`;
    const currency = pkg?.currency || client.currency || client.organization.currency || "USD";

    const lines = [
      ...(pkg
        ? [{
            kind: "PACKAGE" as const,
            description: `${pkg.name} — ${monthLabel}`,
            quantity: 1,
            unitPrice: pkg.billingAmount != null ? Number(pkg.billingAmount) : 0,
            contentItemId: null,
          }]
        : []),
      ...extras.map((i) => ({
        kind: "EXTRA" as const,
        description: `Extra ${i.creativeType.name} — ${i.topic}`,
        quantity: 1,
        unitPrice: rateByName.get(i.creativeType.name.trim().toLowerCase()) ?? 0,
        contentItemId: i.id,
      })),
    ];

    return NextResponse.json({ month, monthLabel, currency, packageFound: !!pkg, lines });
  } catch (error) {
    return handleApiError(error, "GET /api/invoices/generate-from-month");
  }
}
