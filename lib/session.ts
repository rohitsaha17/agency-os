import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Signed session tokens (QA-002).
 *
 * The session used to be a raw, unsigned `userId` cookie: anyone who learned or
 * guessed a user id could set that cookie and be that user, and a password
 * change or deactivation did nothing to a cookie already handed out. This makes
 * the cookie a tamper-proof, time-limited token instead.
 *
 * Stateless by design — no session table. The token carries the user id, the
 * account's `passwordSetAt` at issue time, and issued/expiry timestamps, all
 * HMAC-signed with a server-only secret. lib/current-user.ts re-reads the user
 * and rejects the token when the signed `passwordSetAt` no longer matches the
 * database, so a password change or admin reset (both stamp `passwordSetAt`)
 * invalidates every token minted before it. Deactivation is caught there too by
 * the existing `isActive` check.
 *
 * The secret is NEVER hardcoded and NEVER sent to the client. It is read from
 * the environment; if it is absent the module throws rather than fall back to a
 * guessable default — a signing key that ships in the source is no key at all.
 */

const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

/**
 * Resolve the signing secret. SESSION_SECRET is the intended variable;
 * NEXTAUTH_SECRET is accepted because a deployment may already have a strong
 * one configured. No default: a missing secret is a hard, loud failure, not a
 * silent weak key.
 */
function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (s.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). Set a long random SESSION_SECRET "
      + "on this environment; sessions cannot be signed without it.",
    );
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export interface SessionPayload {
  /** user id */
  uid: string;
  /** passwordSetAt epoch ms at issue time (0 when the account had none) */
  pwa: number;
  /** issued-at epoch seconds */
  iat: number;
  /** expiry epoch seconds */
  exp: number;
  /** random nonce so two tokens for the same user in the same second differ */
  n: string;
}

/**
 * Mint a signed token for a user. `passwordSetAt` binds the token to the
 * current credential so a later change/reset invalidates it.
 */
export function signSession(
  userId: string,
  passwordSetAt: Date | null | undefined,
  maxAgeSeconds: number = THIRTY_DAYS_S,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: userId,
    pwa: passwordSetAt ? passwordSetAt.getTime() : 0,
    iat: now,
    exp: now + maxAgeSeconds,
    n: randomBytes(6).toString("base64url"),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload, or null when the
 * token is missing, malformed, tampered, or expired. Does NOT touch the
 * database — the caller re-reads the user and checks `pwa` against it.
 */
export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(body);
  } catch {
    // Secret missing/misconfigured — treat as unauthenticated, never as valid.
    return null;
  }

  // Constant-time comparison; bail if lengths differ (timingSafeEqual throws).
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}

/** Cookie options shared by every place that sets the session cookie. */
export const SESSION_COOKIE = "userId";
export function sessionCookieOptions(maxAgeSeconds: number = THIRTY_DAYS_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
