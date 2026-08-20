import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// GET /api/invoices/generate-from-month?clientId=&month=YYYY-MM
// Prefill lines for the "Generate from month" invoice mode:
//   (a) PACKAGE line from the active ClientPackage
//   (b) one EXTRA line per delivered (POSTED) extra/ad-hoc content item that
//       month with invoicedInId null, unpriced — the admin sets the amount
//       in the builder (v3 retired rate cards).
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "invoices.manage");
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

    const [packages, extras] = await Promise.all([
      prisma.clientPackage.findMany({
        where: {
          organizationId: user.organizationId, clientId, isActive: true,
          startMonth: { lte: from },
          OR: [{ endMonth: null }, { endMonth: { gte: from } }],
        },
        orderBy: { createdAt: "asc" },
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
    ]);

    const monthLabel = `${MONTH_NAMES[m - 1]} ${y}`;
    const currency =
      packages.find((p) => p.currency)?.currency ||
      client.currency || client.organization.currency || "USD";

    // Concurrent packages: one PACKAGE line each (e.g. social + website).
    const lines = [
      ...packages.map((p) => ({
        kind: "PACKAGE" as const,
        description: `${p.name} — ${monthLabel}`,
        quantity: 1,
        unitPrice: p.billingAmount != null ? Number(p.billingAmount) : 0,
        contentItemId: null,
      })),
      // v3: rate cards are retired — extras come through unpriced and the
      // admin types the amount in the builder.
      ...extras.map((i) => ({
        kind: "EXTRA" as const,
        description: `Extra ${i.creativeType.name} — ${i.topic}`,
        quantity: 1,
        unitPrice: 0,
        contentItemId: i.id,
      })),
    ];

    return NextResponse.json({ month, monthLabel, currency, packageFound: packages.length > 0, lines });
  } catch (error) {
    return handleApiError(error, "GET /api/invoices/generate-from-month");
  }
}
