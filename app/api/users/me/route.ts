import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-errors";

// GET /api/users/me — the current user plus their organization details
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        organizationId: true,
        passwordHash: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            currency: true,
            timezone: true,
            dateFormat: true,
            onboardingCompleted: true,
          },
        },
      },
    });

    if (!user) {
      return apiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    // Never expose the hash — surface only whether a password is set.
    const { passwordHash, ...safe } = user;
    return NextResponse.json({ ...safe, hasPassword: !!passwordHash });
  } catch (error) {
    return handleApiError(error, "GET /api/users/me");
  }
}
