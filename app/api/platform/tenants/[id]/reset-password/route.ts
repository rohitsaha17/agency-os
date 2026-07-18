import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { hashPassword, validatePassword } from "@/lib/password";

/**
 * POST /api/platform/tenants/[id]/reset-password — platform-admin only.
 *
 * Resets the workspace OWNER's login password.
 *   • body { newPassword } → sets that password (admin hands it over).
 *   • body {} / no password → clears the password so the owner sets a new
 *     one on their next sign-in (the normal first-login flow).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requirePlatformAdmin(req);
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const newPassword: unknown = body?.newPassword;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) throw new ApiError("Workspace not found", 404);

    // Reset the earliest OWNER (the account created at workspace setup).
    const owner = await prisma.user.findFirst({
      where: { organizationId: id, role: "OWNER" },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) throw new ApiError("This workspace has no owner account to reset", 404);

    if (newPassword != null && newPassword !== "") {
      const pwError = validatePassword(newPassword);
      if (pwError) return apiError(pwError, 400);
      await prisma.user.update({
        where: { id: owner.id },
        data: { passwordHash: hashPassword(String(newPassword)), passwordSetAt: new Date() },
      });
      return NextResponse.json({ ok: true, mode: "set", ownerEmail: owner.email });
    }

    // Clear → owner re-sets on next login.
    await prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash: null, passwordSetAt: null },
    });
    return NextResponse.json({ ok: true, mode: "cleared", ownerEmail: owner.email });
  } catch (error) {
    return handleApiError(error, "POST /api/platform/tenants/[id]/reset-password");
  }
}
