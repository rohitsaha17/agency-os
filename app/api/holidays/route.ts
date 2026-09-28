import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { can } from "@/lib/permissions";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";

const MAX_NAME = 80;
/** A closure longer than this is a shutdown somebody should reconsider. */
const MAX_SPAN_DAYS = 60;

/**
 * The office holiday list.
 *
 * READ IS OPEN, WRITE IS NOT
 *
 * Everyone in the workspace reads it — a list of closed days that only
 * managers can see is not a holiday list. Only settings.manage writes it,
 * which is exactly OWNER, ADMIN and MANAGER; SMM and TEAM have it false.
 *
 * Deliberately inert. This endpoint returns dates and names. Nothing here
 * moves a deadline, excludes a day from availability or touches attendance.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const upcoming = searchParams.get("upcoming") === "1";

    let range: { gte?: Date; lte?: Date } | undefined;
    if (year && /^\d{4}$/.test(year)) {
      range = {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lte: new Date(`${year}-12-31T00:00:00.000Z`),
      };
    }

    let current: object | undefined;
    if (!range && upcoming) {
      // From today, in the workspace's own calendar — a holiday is not past
      // until the day is over where the office is.
      const iso = new Intl.DateTimeFormat("en-CA", {
        timeZone: user.organization?.timezone || "UTC",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const today = new Date(`${iso}T00:00:00.000Z`);
      // A week that started yesterday and ends on Friday has not passed. It
      // is the one most worth showing, so it is matched on its END.
      current = {
        OR: [
          { endDate: { gte: today } },
          { endDate: null, date: { gte: today } },
        ],
      };
    }

    const holidays = await prisma.holiday.findMany({
      where: {
        organizationId: user.organizationId,
        ...(range && { date: range }),
        ...(current ?? {}),
      },
      orderBy: { date: "asc" },
      ...(upcoming && { take: 12 }),
      select: { id: true, name: true, date: true, endDate: true },
    });

    return NextResponse.json({
      holidays: holidays.map((h) => ({
        id: h.id,
        name: h.name,
        /** "YYYY-MM-DD". A date, never an instant — see the model. */
        date: h.date.toISOString().slice(0, 10),
        /** The last day, when it runs over several. Null for a single day. */
        endDate: h.endDate ? h.endDate.toISOString().slice(0, 10) : null,
      })),
      /* So the list can offer Add and Remove to the people who have them,
         while the server decides it again on every write. */
      canManage: can(user, "settings.manage"),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/holidays");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "settings.manage");

    const rl = checkRateLimit(req, `holidays:create:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const date = typeof body?.date === "string" ? body.date.trim() : "";
    const endRaw = typeof body?.endDate === "string" ? body.endDate.trim() : "";

    if (!name) throw new ApiError("Give the holiday a name", 400);
    if (name.length > MAX_NAME) throw new ApiError(`Keep the name under ${MAX_NAME} characters`, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("Pick a date", 400);

    const when = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(when.getTime())) throw new ApiError("That date is not real", 400);

    let endWhen: Date | null = null;
    if (endRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) throw new ApiError("That last day is not a date", 400);
      endWhen = new Date(`${endRaw}T00:00:00.000Z`);
      if (Number.isNaN(endWhen.getTime())) throw new ApiError("That last day is not real", 400);
      if (endWhen < when) throw new ApiError("The last day comes before the first one", 400);
      const span = Math.round((endWhen.getTime() - when.getTime()) / 86_400_000) + 1;
      if (span > MAX_SPAN_DAYS) {
        throw new ApiError(`A single closure cannot run longer than ${MAX_SPAN_DAYS} days`, 400);
      }
      // One day entered twice is one day, not a range.
      if (endWhen.getTime() === when.getTime()) endWhen = null;
    }

    try {
      const created = await prisma.holiday.create({
        data: { organizationId: user.organizationId, name, date: when, endDate: endWhen },
        select: { id: true, name: true, date: true, endDate: true },
      });
      return NextResponse.json(
        {
          id: created.id,
          name: created.name,
          date: created.date.toISOString().slice(0, 10),
          endDate: created.endDate ? created.endDate.toISOString().slice(0, 10) : null,
        },
        { status: 201 },
      );
    } catch (err) {
      // The unique index is on (org, date, name): the same name twice on one
      // day is a double submission, not an intention.
      if ((err as { code?: string }).code === "P2002") {
        throw new ApiError("That holiday is already on the list", 409);
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "POST /api/holidays");
  }
}
