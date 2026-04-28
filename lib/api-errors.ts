import { NextResponse } from "next/server";

/**
 * Consistent API error shape: `{ error: { message, code } }`.
 *
 * Routes should throw `ApiError` (via `apiError()`) for expected failures,
 * and wrap `catch` blocks with `handleApiError(err)` to avoid leaking
 * stack traces or internal DB errors to clients.
 */

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? defaultCodeForStatus(status);
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 422: return "UNPROCESSABLE";
    case 429: return "RATE_LIMITED";
    case 503: return "SERVICE_UNAVAILABLE";
    default:  return status >= 500 ? "INTERNAL" : "ERROR";
  }
}

/**
 * Build a consistent error response: { error: { message, code } }.
 *
 * Use this (or throw `ApiError`) to surface client-visible failures
 * with a stable shape. `code` is auto-derived from `status` if omitted.
 */
export function apiError(message: string, status = 400, code?: string): NextResponse {
  const resolvedCode = code ?? defaultCodeForStatus(status);
  return NextResponse.json(
    { error: { message, code: resolvedCode } },
    { status }
  );
}

/**
 * Central catch-block helper.
 *
 * - Logs the original error server-side (with route tag if provided)
 * - Returns the original `ApiError` shape if the caller threw one
 *   (known, safe-to-show failures like 400/401/403/404)
 * - Otherwise returns a generic 500 with NO stack trace or DB details.
 */
export function handleApiError(err: unknown, tag?: string): NextResponse {
  if (err instanceof ApiError) {
    // Known, safe error — surface message as-is.
    return apiError(err.message, err.status, err.code);
  }

  // Unknown error — log it for operators, return generic message to caller.
  const prefix = tag ? `[${tag}]` : "[api]";
  if (err instanceof Error) {
    console.error(prefix, err.message);
  } else {
    console.error(prefix, "Non-Error thrown:", typeof err);
  }

  return NextResponse.json(
    { error: { message: "Internal error", code: "INTERNAL" } },
    { status: 500 }
  );
}
