/**
 * Simple in-memory rate limiter for API endpoints.
 * Tracks requests per IP/key within a sliding window.
 *
 * For production, replace with Redis-based limiter.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  options: RateLimitOptions = { limit: 30, windowSeconds: 60 }
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + options.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  if (entry.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Get a rate limit key from a request.
 * Uses x-forwarded-for, x-real-ip, or falls back to a generic key.
 */
export function getRateLimitKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
  return `${prefix}:${ip}`;
}

/**
 * Pre-configured rate limits for write endpoints.
 *
 * heavy: expensive writes (uploads, project creation, bulk deletes) — 20/min
 * light: normal mutations (invoices, clients, contracts) — 60/min
 */
export const WRITE_RATE_LIMITS = {
  heavy: { limit: 20, windowSeconds: 60 },
  light: { limit: 60, windowSeconds: 60 },
} as const;

/**
 * Convenience: apply a rate-limit check and return a ready-to-use
 * { allowed, response } pair. Callers can return `response` directly
 * when `allowed === false`.
 */
export function checkRateLimit(
  req: Request,
  prefix: string,
  options: RateLimitOptions
): { allowed: true } | { allowed: false; resetAt: number } {
  const key = getRateLimitKey(req, prefix);
  const result = rateLimit(key, options);
  if (!result.allowed) return { allowed: false, resetAt: result.resetAt };
  return { allowed: true };
}
