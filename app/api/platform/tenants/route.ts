import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { requirePlatformAdmin } from "@/lib/platform-admin";

/**
 * Platform-admin tenant management — for the SaaS owner, NOT tenant users.
 *
 * Guarded by the `x-admin-key` header, which must equal the
 * PLATFORM_ADMIN_KEY environment variable. If the env var isn't set the
 * endpoint is disabled entirely (503) so it can never be accidentally
 * open in production.
 *
 *   GET  /api/platform/tenants        → list all organizations
 *   POST /api/platform/tenants        → create org + its OWNER user
 */

export async function GET(req: NextRequest) {
  try {
    requirePlatformAdmin(req);

    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        onboardingCompleted: true,
        onboardedAt: true,
        createdAt: true,
        plan: true,
        trialEndsAt: true,
        uploadLimitMb: true,
        users: {
          where: { role: "OWNER" },
          select: { id: true, name: true, email: true },
          take: 1,
        },
        files: { select: { size: true } },
        _count: { select: { users: true, clients: true, projects: true, invoices: true } },
      },
    });

    return NextResponse.json(
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        onboardingCompleted: o.onboardingCompleted,
        onboardedAt: o.onboardedAt,
        createdAt: o.createdAt,
        plan: o.plan,
        trialEndsAt: o.trialEndsAt,
        uploadLimitMb: o.uploadLimitMb,
        storageUsedBytes: o.files.reduce((s, f) => s + (f.size ?? 0), 0),
        owner: o.users[0] ?? null,
        counts: o._count,
      }))
    );
  } catch (err) {
    return handleApiError(err, "GET /api/platform/tenants");
  }
}

export async function POST(req: NextRequest) {
  try {
    requirePlatformAdmin(req);
    const rl = checkRateLimit(req, "platform:create-tenant", { limit: 10, windowSeconds: 60 });
    if (!rl.allowed) return apiError("Too many requests", 429);

    const body = await req.json();
    const orgName = (body?.organizationName ?? "").toString().trim();
    const ownerName = (body?.ownerName ?? "").toString().trim();
    const ownerEmail = (body?.ownerEmail ?? "").toString().trim().toLowerCase();

    if (!orgName) throw new ApiError("Organization name is required", 400);
    if (!ownerName) throw new ApiError("Owner name is required", 400);
    if (!ownerEmail || !ownerEmail.includes("@")) {
      throw new ApiError("A valid owner email is required", 400);
    }

    // One person = one workspace in the email-login model: reject emails
    // already used anywhere, otherwise login couldn't disambiguate.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError("That email is already used by another workspace", 409, "CONFLICT");
    }

    // New workspaces start on a 14-day trial by default.
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName, onboardingCompleted: false, plan: "TRIAL", trialEndsAt },
      });
      const owner = await tx.user.create({
        data: {
          organizationId: org.id,
          name: ownerName,
          email: ownerEmail,
          role: "OWNER",
          isActive: true,
        },
      });
      return { org, owner };
    });

    return NextResponse.json(
      {
        id: result.org.id,
        name: result.org.name,
        owner: {
          id: result.owner.id,
          name: result.owner.name,
          email: result.owner.email,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err, "POST /api/platform/tenants");
  }
}
