import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";

/**
 * GET /api/users/me — the current user plus their organization details.
 *
 * This used to authenticate (one `user.findUnique`) and then immediately run
 * a second, wider `user.findUnique` for the same row. Two round trips for one
 * user: ~386ms of the ~673ms this endpoint took, for data the first query
 * could have selected. getCurrentUser now selects the wider shape — including
 * the organization — so this is a single round trip.
 *
 * It matters more than one endpoint's own timing: almost every page in the app
 * waits on this call before it starts fetching its own data.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "GET /api/users/me");
  }
}
