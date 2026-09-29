import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { hashPassword, validatePassword } from "@/lib/password";
import { mintSetupToken } from "@/lib/setup-token";

/**
 * POST /api/platform/tenants/[id]/reset-password — platform-admin only.
 *
 * Resets the workspace OWNER's login password.
 *   • body { newPassword } → sets that password (admin hands it over).
 *   • body {} / no password → clears the password AND mints a single-use setup
 *     token, returned as a link the owner uses to choose a new one (QA-001).
 *     Email alone can no longer claim the account, so a bare clear would lock
 *     the owner out — the token is what lets them back in.
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

    // Clear → owner re-sets via a fresh single-use setup link.
    const setup = mintSetupToken();
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        passwordHash: null, passwordSetAt: null,
        setupTokenHash: setup.hash, setupTokenExpiresAt: setup.expiresAt,
      },
    });
    return NextResponse.json({
      ok: true, mode: "cleared", ownerEmail: owner.email,
      setupToken: setup.token,
      setupPath: `/set-password?token=${encodeURIComponent(setup.token)}`,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/platform/tenants/[id]/reset-password");
  }
}
