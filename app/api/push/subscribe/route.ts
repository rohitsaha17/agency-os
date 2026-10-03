import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

// POST /api/push/subscribe — save (or refresh) this browser's push
// subscription for the signed-in user. The endpoint is globally unique, so the
// same browser re-subscribing updates its row instead of creating a duplicate.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sub = await req.json().catch(() => null);
    const endpoint: unknown = sub?.endpoint;
    const p256dh: unknown = sub?.keys?.p256dh;
    const auth: unknown = sub?.keys?.auth;

    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      // Re-point an existing endpoint at whoever is signed in now (a shared
      // phone), and refresh its keys.
      update: { userId: user.id, organizationId: user.organizationId, p256dh, auth, userAgent },
      create: { userId: user.id, organizationId: user.organizationId, endpoint, p256dh, auth, userAgent },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "POST /api/push/subscribe");
  }
}

// DELETE /api/push/subscribe — drop this browser's subscription (the user
// turned notifications off). Body: { endpoint }.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const endpoint: unknown = body?.endpoint;
    if (typeof endpoint !== "string") {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    // Scope the delete to the caller so one user can't unsubscribe another.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/push/subscribe");
  }
}
