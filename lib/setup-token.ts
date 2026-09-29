import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Single-use first-password setup tokens (QA-001).
 *
 * A freshly-invited account has no password. The old flow let anyone set it by
 * email alone — so a stranger could claim any not-yet-activated account in any
 * tenant. Instead, the invite mints a high-entropy token; only its SHA-256 hash
 * is stored on the user row, it expires, and it is cleared the instant a
 * password is set. The raw token is shown to the inviting admin exactly once and
 * never persisted, logged, or retrievable through any read API.
 */

const TOKEN_BYTES = 32;               // 256 bits of entropy
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface MintedSetupToken {
  /** The raw token — returned to the admin ONCE, never stored or logged. */
  token: string;
  /** SHA-256 hash of the token — this is what gets stored on the user row. */
  hash: string;
  /** When the token stops working. */
  expiresAt: Date;
}

/** Hash a token for storage/lookup. Deterministic, so lookups can match. */
export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a fresh token + its stored hash + expiry. */
export function mintSetupToken(ttlMs: number = DEFAULT_TTL_MS): MintedSetupToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashSetupToken(token), expiresAt: new Date(Date.now() + ttlMs) };
}

/** Constant-time comparison of a presented token against a stored hash. */
export function setupTokenMatches(presented: string, storedHash: string | null | undefined): boolean {
  if (!presented || !storedHash) return false;
  const a = Buffer.from(hashSetupToken(presented));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
