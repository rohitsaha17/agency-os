import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/**
 * v3 — job labels an agency defines for itself (Editor, Photographer…).
 *
 * A designation is NEVER a permission (docs/V3_CONTEXT.md §2) — it drives
 * assignment pickers, filtering and reports. Permissions are UserRole.
 */

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Role names, which a designation may not reuse. */
const ROLE_SLUGS = new Set(["owner", "admin", "manager", "smm", "team", "member"]);

// GET /api/designations?activeOnly=1&assignableOnly=1
// Readable by anyone signed in — assignment pickers need it.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const designations = await prisma.designationRole.findMany({
      where: {
        organizationId: user.organizationId,
        ...(sp.get("activeOnly") === "1" ? { isActive: true } : {}),
        ...(sp.get("assignableOnly") === "1" ? { canBeAssignedWork: true } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    return NextResponse.json(designations);
  } catch (error) {
    return handleApiError(error, "GET /api/designations");
  }
}

// POST /api/designations — admin only
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");

    const { name, canBeAssignedWork } = await req.json();
    if (!name?.trim()) throw new ApiError("Name is required", 400);

    const slug = slugify(name);
    if (!slug) throw new ApiError("Name must contain letters or numbers", 400);

    // A designation must never share a name with a role. "Admin / SMM" reads
    // as a contradiction when one column means what you MAY do and the other
    // means what you DO (docs/V3_CONTEXT.md §2).
    if (ROLE_SLUGS.has(slug)) {
      throw new ApiError(
        `"${name.trim()}" is a role, not a job title. Set it under Role instead — `
        + "a designation describes the craft (Editor, Photographer), not the access level.",
        400,
      );
    }

    const clash = await prisma.designationRole.findFirst({
      where: { organizationId: user.organizationId, slug },
      select: { id: true },
    });
    if (clash) throw new ApiError("That designation already exists", 409);

    const last = await prisma.designationRole.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await prisma.designationRole.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        slug,
        canBeAssignedWork: canBeAssignedWork !== false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/designations");
  }
}
