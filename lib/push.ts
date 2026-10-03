// Web Push delivery — turns an in-app notification into a phone/desktop push.
//
// This is additive: if the VAPID keys are not configured, or a user has no
// subscriptions, every function here quietly no-ops. The in-app notification
// (lib/notify.ts) is created regardless, so nothing breaks when push is off.
//
// Setup (once, in the deployment's environment variables):
//   1. Generate a keypair:  npx web-push generate-vapid-keys
//   2. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT
//      (VAPID_SUBJECT is a "mailto:you@domain" or your site URL).
//   3. `npx prisma db push` so the push_subscriptions table exists.

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
// A contact the push service can reach about this sender. Any https URL or
// mailto works; fall back to a neutral one so a missing env var doesn't crash
// web-push's validation (we still gate on the keys below).
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:notifications@studioflow.app";

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  } catch (err) {
    console.error("[push] invalid VAPID config:", err);
  }
}

/** The public key the browser needs to subscribe. Empty when push is off. */
export function vapidPublicKey(): string {
  return PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Deliver a push to every device a user has subscribed. Best-effort: a dead
 * subscription (the browser revoked it, or the user cleared site data) returns
 * 404/410 and is pruned so it isn't tried again. Never throws.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushConfigured) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      link: payload.link ?? "/",
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number } | null)?.statusCode;
          // 404 Not Found / 410 Gone — the subscription is dead, drop it.
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
          } else {
            console.error("[push] send failed:", status ?? err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}
