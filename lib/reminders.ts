import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

/** Indian festival pack (docs/V2_CONTEXT.md Phase 5) — 2026 + 2027. */
export const FESTIVAL_PACK: { title: string; dates: string[] }[] = [
  { title: "Holi",              dates: ["2026-03-04", "2027-03-22"] },
  { title: "Eid al-Fitr",       dates: ["2026-03-20", "2027-03-10"] },
  { title: "Raksha Bandhan",    dates: ["2026-08-28", "2027-08-17"] },
  { title: "Independence Day",  dates: ["2026-08-15", "2027-08-15"] },
  { title: "Ganesh Chaturthi",  dates: ["2026-09-14", "2027-09-04"] },
  { title: "Navratri",          dates: ["2026-10-11", "2027-09-30"] },
  { title: "Dussehra",          dates: ["2026-10-20", "2027-10-09"] },
  { title: "Diwali",            dates: ["2026-11-08", "2027-10-29"] },
  { title: "Christmas",         dates: ["2026-12-25", "2027-12-25"] },
  { title: "New Year",          dates: ["2026-01-01", "2027-01-01"] },
];

/** Seed the org-wide festival pack once per org (idempotent by title+date). */
export async function ensureFestivalPack(organizationId: string): Promise<void> {
  const existing = await prisma.calendarEvent.count({
    where: { organizationId, kind: "FESTIVAL" },
  });
  if (existing > 0) return;
  await prisma.calendarEvent.createMany({
    data: FESTIVAL_PACK.flatMap((f) =>
      f.dates.map((d) => ({
        organizationId,
        title: f.title,
        date: new Date(`${d}T00:00:00.000Z`),
        kind: "FESTIVAL" as const,
        reminderDaysBefore: 7,
      })),
    ),
  });
}

/**
 * Scan events whose reminder window has opened —
 * (date − reminderDaysBefore) ≤ now < date — and notify users with
 * designation SMM or POC. Client-linked events additionally require the
 * client to be IMPORTANT/VIP. Idempotent: one notification per event+user,
 * enforced by checking for an existing notification with the same link.
 * Returns how many notifications were created.
 */
export async function scanUpcomingEvents(now: Date, organizationId: string): Promise<number> {
  const horizonDays = 31; // widest reminder window we bother scanning
  const horizon = new Date(now.getTime() + horizonDays * 86400000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      reminderDaysBefore: { not: null },
      date: { gt: now, lte: horizon },
    },
    include: { client: { select: { id: true, name: true, importance: true } } },
  });

  const due = events.filter((e) => {
    const windowStart = new Date(e.date.getTime() - (e.reminderDaysBefore ?? 0) * 86400000);
    return windowStart <= now;
  });
  if (due.length === 0) return 0;

  const targets = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      designation: { in: ["SMM", "POC"] },
    },
    select: { id: true },
  });
  if (targets.length === 0) return 0;

  let created = 0;
  for (const event of due) {
    if (event.client && !["IMPORTANT", "VIP"].includes(event.client.importance)) continue;
    const link = `/calendar?event=${event.id}`;
    const type = event.kind === "FESTIVAL" ? "FESTIVAL_REMINDER" : "EVENT_REMINDER";
    for (const target of targets) {
      const already = await prisma.notification.findFirst({
        where: { userId: target.id, type, link },
        select: { id: true },
      });
      if (already) continue;
      const days = Math.ceil((event.date.getTime() - now.getTime()) / 86400000);
      await notify({
        organizationId,
        userId: target.id,
        type,
        title: `${event.title} is in ${days} day${days !== 1 ? "s" : ""}`,
        body: event.client ? `Plan content for ${event.client.name}.` : "Plan the content calendar around it.",
        link,
      });
      created++;
    }
  }
  return created;
}
