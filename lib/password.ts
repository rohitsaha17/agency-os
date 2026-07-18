import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password hashing using Node's built-in scrypt — no external dependency,
 * runs on the Vercel Node runtime. Stored format: `scrypt$<salt>$<hash>`.
 */

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const hashBuf = Buffer.from(hashHex, "hex");
  let testBuf: Buffer;
  try {
    testBuf = scryptSync(password, salt, hashBuf.length);
  } catch {
    return false;
  }
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}

/** Minimum acceptable password. Returns an error string, or null if valid. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 200) return "Password is too long";
  return null;
}
