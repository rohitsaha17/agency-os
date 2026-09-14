"use client";

import { primeCurrentUser, type CurrentUser } from "@/lib/useCurrentUser";

/**
 * Hands the server's answer to the client cache before anything asks for it.
 *
 * The dashboard layout resolves the signed-in user from the httpOnly cookie
 * anyway — it has to, to decide whether to render at all. Without this, the
 * browser then turned round and asked `/api/users/me` for the same row, and
 * every page sat waiting on that (~673ms measured) before sending its own
 * first request.
 *
 * Priming during render rather than in an effect is the whole point: sibling
 * components' effects run after this render, so by the time the sidebar, the
 * bell, the capability guard and the page itself look, the answer is there.
 */
export function CurrentUserSeed({ user }: { user: CurrentUser | null }) {
  primeCurrentUser(user);
  return null;
}
