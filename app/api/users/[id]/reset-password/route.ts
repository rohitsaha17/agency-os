import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability, mayResetPassword } from "@/lib/api-permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/users/[id]/reset-password — an admin unlocks somebody's account.
 *
 * There was no forgot-password flow, so a locked-out teammate needed a hand
 * edit against the database. This is that, made safe and auditable.
 *
 * WHAT IT DOES NOT DO: it does not clear passwordHash. That would be the
 * shorter route — /api/auth/set-password already lets an account with no hash
 * pick a password — but it lets ANYONE who knows the email address do it.
 * That trade is fine for a fresh invite, where the account holds nothing; on
 * a live account it means a stranger can claim a year of somebody's work
 * simply by getting there before they do.
 *
 * So the server generates a temporary password and returns it ONCE. It is
 * hashed before it is stored, never written to a log, and there is no second
 * endpoint that can read it back — if the admin loses it, they reset again.
 *
 * `mustChangePassword` closes the window the temporary password opens. For as
 * long as it stands, somebody other than the account holder knows how to sign
 * in as them; the flag means that works exactly once, and the screen after it
 * is "choose a new one".
 *
 * TWO REFUSALS, AND BOTH MATTER
 *
 * Not yourself. Changing your own password already exists, and it asks for
 * the current one first. Routing round that here would turn "I am signed in
 * on a machine somebody left unlocked" into a permanent takeover.
 *
 * Not an OWNER, unless you are one. users.manage belongs to ADMIN as well as
 * OWNER, so without this an admin could reset the owner's password, sign in
 * as them and hold every capability there is. An owner is the one account an
 * admin must not be able to become.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");

    // Tighter than the ordinary write limit. This mints credentials.
    const rl = checkRateLimit(req, `users:reset-password:${user.id}`, {
      limit: 5, windowSeconds: 60,
    });
    if (!rl.allowed) return apiError("Too many resets, please wait a minute", 429);

    const { id } = await params;

    const target = await prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!target) throw new ApiError("That person isn't on this team", 404);

    // The refusals live in lib/api-permissions so they can be asserted
    // directly — see mayResetPassword, and scripts/check-hr.ts.
    const verdict = mayResetPassword(user, target);
    if (!verdict.ok) throw new ApiError(verdict.reason, 403);

    const temporaryPassword = generateTemporaryPassword();

    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        passwordSetAt: new Date(),
        mustChangePassword: true,
      },
    });

    // Who did this, and to whom. A reset is exactly the kind of act that
    // should never be reconstructable only from somebody's memory.
    await logStatus({
      organizationId: user.organizationId,
      entityType: "USER",
      entityId: target.id,
      to: "PASSWORD_RESET",
      userId: user.id,
      note: `Password reset by ${user.name}`,
    });

    /*
      Tell the person it happened.

      If a reset they did not ask for lands on their account, the notification
      is how they find out — and finding out is the whole point. Learning it
      by discovering you cannot sign in is too late to be useful.
    */
    await notify({
      organizationId: user.organizationId,
      userId: target.id,
      type: "PASSWORD_RESET",
      title: "Your password was reset",
      body: `${user.name} reset it. You'll be asked to choose a new one when you next sign in — if you didn't expect this, tell them straight away.`,
      link: "/settings",
    }).catch(() => { /* the reset stands whether or not the ping lands */ });

    // The one and only time this value leaves the server.
    return NextResponse.json({
      ok: true,
      name: target.name,
      email: target.email,
      temporaryPassword,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/users/[id]/reset-password");
  }
}
