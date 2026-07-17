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

  // Unknown error — log it for operators.
  const prefix = tag ? `[${tag}]` : "[api]";
  if (err instanceof Error) {
    console.error(prefix, err.name, err.message, err.stack);
  } else {
    console.error(prefix, "Non-Error thrown:", typeof err, err);
  }

  // Surface the underlying error name + a useful line of message to
  // callers. Solo-dev deploys: worth the debuggability trade-off.
  // Tighten to a generic "Internal error" once real end users show up.
  //
  // Prisma errors format their message with a bunch of leading whitespace
  // and the useful line 2+ lines down, so we pick the first NON-EMPTY line
  // rather than "message.split('\\n')[0]" (which was returning "").
  // Prisma errors also carry a `.code` (P1001, P2002, etc.) — that's often
  // the single most useful piece of info, so include it if present.
  let detail = "Unknown internal error";
  if (err instanceof Error) {
    const firstMeaningfulLine =
      err.message
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? "";
    const prismaCode = (err as unknown as { code?: string }).code;
    detail = `${err.name}${prismaCode ? ` (${prismaCode})` : ""}: ${firstMeaningfulLine.slice(0, 320) || "(no message)"}`;
  }

  return NextResponse.json(
    { error: { message: detail, code: "INTERNAL" } },
    { status: 500 }
  );
}
