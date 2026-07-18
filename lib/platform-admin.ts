import { ApiError } from "@/lib/api-errors";

/**
 * Guard for platform-owner-only endpoints. Requires the `x-admin-key`
 * header to equal PLATFORM_ADMIN_KEY. If the env var is unset the endpoint
 * is disabled (503) so it can never be accidentally open.
 */
export function requirePlatformAdmin(req: Request): void {
  const configured = process.env.PLATFORM_ADMIN_KEY;
  if (!configured) {
    throw new ApiError(
      "Platform admin is disabled — set PLATFORM_ADMIN_KEY in the environment",
      503,
      "ADMIN_DISABLED"
    );
  }
  const provided = req.headers.get("x-admin-key");
  if (provided !== configured) {
    throw new ApiError("Invalid admin key", 401, "UNAUTHORIZED");
  }
}
