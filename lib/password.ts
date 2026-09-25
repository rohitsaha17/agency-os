import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";

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

/**
 * A temporary password for an admin-initiated reset.
 *
 * Generated on the server, never chosen by the admin. Left to a person this
 * becomes "Welcome123" on every account, or — worse — a password the admin
 * already knows the user uses somewhere else.
 *
 * The alphabet omits O/0, I/l/1 and similar pairs on purpose. This gets read
 * out over a phone or copied off a screen, and a reset nobody can type is a
 * support call rather than a fix. Three groups of four with dashes for the
 * same reason: it is transcribable.
 *
 * randomInt, not Math.random: this is a credential, and it is briefly the
 * only thing standing between a stranger and somebody's account.
 */
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let out = "";
    for (let i = 0; i < 4; i++) {
      out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    }
    groups.push(out);
  }
  return groups.join("-");
}
