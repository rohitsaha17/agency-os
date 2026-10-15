import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";

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

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new ApiError("That date is not valid", 400);
  return d;
}

/**
 * PATCH /api/users/me — edit YOUR OWN basic details.
 *
 * My Account: a member fixing their own name and contact details without an
 * admin. Deliberately limited to things that cannot harm administration —
 * name, phone, address, dates, emergency contact, notes. It never touches
 * role, active status, designation or email (the login identity); those stay
 * with an account admin through /api/users/[id]. No capability needed; it is
 * your own record.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { name, staffProfile } = body ?? {};

    const data: { name?: string } = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) throw new ApiError("Name can't be empty", 400);
      data.name = trimmed;
    }

    if (staffProfile !== undefined) {
      if (staffProfile === null || typeof staffProfile !== "object") {
        throw new ApiError("staffProfile must be an object", 400);
      }
      const p = staffProfile as Record<string, unknown>;
      const profile = {
        ...(p.phone !== undefined && { phone: p.phone ? String(p.phone).trim() : null }),
        ...(p.address !== undefined && { address: p.address ? String(p.address).trim() : null }),
        ...(p.emergencyName !== undefined && { emergencyName: p.emergencyName ? String(p.emergencyName).trim() : null }),
        ...(p.emergencyPhone !== undefined && { emergencyPhone: p.emergencyPhone ? String(p.emergencyPhone).trim() : null }),
        ...(p.notes !== undefined && { notes: p.notes ? String(p.notes).trim() : null }),
        ...(p.dateOfBirth !== undefined && { dateOfBirth: parseDate(p.dateOfBirth) }),
        ...(p.dateOfJoining !== undefined && { dateOfJoining: parseDate(p.dateOfJoining) }),
      };
      await prisma.staffProfile.upsert({
        where: { userId: user.id },
        update: profile,
        create: { organizationId: user.organizationId, userId: user.id, ...profile },
      });
    }

    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: user.id }, data });
    }

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, name: true, email: true, role: true,
        staffProfile: {
          select: {
            phone: true, address: true, dateOfBirth: true, dateOfJoining: true,
            emergencyName: true, emergencyPhone: true, notes: true,
          },
        },
      },
    });
    return NextResponse.json(fresh);
  } catch (error) {
    return handleApiError(error, "PATCH /api/users/me");
  }
}
