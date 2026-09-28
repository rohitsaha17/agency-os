import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError, ApiError } from "@/lib/api-errors";

/** DELETE /api/holidays/[id] — take a day back off the list. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "settings.manage");
    const { id } = await params;

    // Scoped to the tenant in the same statement, so a guessed id from
    // another workspace deletes nothing and reports not found.
    const removed = await prisma.holiday.deleteMany({
      where: { id, organizationId: user.organizationId },
    });
    if (removed.count === 0) throw new ApiError("Holiday not found", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/holidays/[id]");
  }
}

const MAX_NAME = 80;
const MAX_SPAN_DAYS = 60;

/**
 * PATCH /api/holidays/[id] — fix one after the fact.
 *
 * Same rules as creating one, because it is the same row: an image of a date
 * that does not exist, or a closure running backwards, is no more acceptable
 * on an edit than it was on the way in.
 *
 * Every field is optional. Sending only a name renames it and leaves the
 * dates alone, which is the common case — somebody typed "Diwlai".
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "settings.manage");
    const { id } = await params;

    const existing = await prisma.holiday.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, date: true, endDate: true },
    });
    if (!existing) throw new ApiError("Holiday not found", 404);

    const body = await req.json().catch(() => ({}));
    const data: { name?: string; date?: Date; endDate?: Date | null } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new ApiError("Give the holiday a name", 400);
      if (name.length > MAX_NAME) throw new ApiError(`Keep the name under ${MAX_NAME} characters`, 400);
      data.name = name;
    }

    if (body.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) throw new ApiError("Pick a date", 400);
      data.date = new Date(`${body.date}T00:00:00.000Z`);
      if (Number.isNaN(data.date.getTime())) throw new ApiError("That date is not real", 400);
    }

    if (body.endDate !== undefined) {
      if (body.endDate === null || body.endDate === "") {
        data.endDate = null;
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.endDate))) {
          throw new ApiError("That last day is not a date", 400);
        }
        const end = new Date(`${body.endDate}T00:00:00.000Z`);
        if (Number.isNaN(end.getTime())) throw new ApiError("That last day is not real", 400);
        data.endDate = end;
      }
    }

    // Checked against whichever of the two is changing, so moving only the
    // first day past an unchanged last day is caught as well.
    const first = data.date ?? existing.date;
    const last = data.endDate !== undefined ? data.endDate : existing.endDate;
    if (last) {
      if (last < first) throw new ApiError("The last day comes before the first one", 400);
      const span = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
      if (span > MAX_SPAN_DAYS) {
        throw new ApiError(`A single closure cannot run longer than ${MAX_SPAN_DAYS} days`, 400);
      }
      // One day entered twice is one day, not a range of one.
      if (last.getTime() === first.getTime()) data.endDate = null;
    }

    if (Object.keys(data).length === 0) throw new ApiError("Nothing to change", 400);

    try {
      const updated = await prisma.holiday.update({
        where: { id },
        data,
        select: { id: true, name: true, date: true, endDate: true },
      });
      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        date: updated.date.toISOString().slice(0, 10),
        endDate: updated.endDate ? updated.endDate.toISOString().slice(0, 10) : null,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new ApiError("That holiday is already on the list", 409);
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "PATCH /api/holidays/[id]");
  }
}
