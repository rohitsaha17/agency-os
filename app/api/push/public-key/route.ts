import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

// The browser needs the VAPID public key to create a push subscription.
// Served from the server so we don't depend on a NEXT_PUBLIC_* var being
// present at build time. Empty string when push isn't configured — the client
// treats that as "push unavailable" and shows nothing.
export async function GET() {
  return NextResponse.json({ key: vapidPublicKey() });
}
