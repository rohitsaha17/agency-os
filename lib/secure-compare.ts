import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (QA-022).
 *
 * A plain `a === b` on a secret leaks, through its timing, how long a prefix of
 * the guess was correct — enough to recover the secret byte by byte over many
 * tries. This compares in time that doesn't depend on where the first mismatch
 * is. Length is compared first (unavoidable, and length alone is a weak signal);
 * both empty/missing inputs are treated as a non-match so a route can't be
 * bypassed by simply omitting the secret and having it "equal" an unset value.
 */
export function secureEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
