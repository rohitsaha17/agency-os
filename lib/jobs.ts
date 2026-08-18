import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/notify";
import { logStatus } from "@/lib/audit";
import { scanUpcomingEvents } from "@/lib/reminders";

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

/**
 * The v2 daily scan (docs/V2_CONTEXT.md Phase 8). Idempotent per calendar
 * day via JobRun. Steps:
 *  (a) tasks past due & not DONE → DEADLINE_MISSED to each assignee +
 *      a summary notification to managers/HEAD_OF_DESIGN
 *  (b) ContentItems past date & not POSTED/MISSED → set MISSED (logged) +
 *      notify SMM/POC with a carry-forward hint
 *  (c) due follow-ups → notify assignee
 *  (d) event reminders (scanUpcomingEvents)
 *  Mondays: weekly digests. 1st of month: monthly digests.
 *
 * `force` bypasses the once-per-day guard (dev button).
 */
export async function runDailyScan(now: Date, force = false): Promise<{ ran: boolean; summary?: Record<string, number> }> {
  const runDate = dayKey(now);
  if (!force) {
    const existing = await prisma.jobRun.findUnique({
      where: { jobName_runDate: { jobName: "daily-scan", runDate } },
    });
    if (existing) return { ran: false };
  }
  try {
    await prisma.jobRun.create({ data: { jobName: "daily-scan", runDate } });
  } catch {
    if (!force) return { ran: false }; // concurrent run claimed it
  }

  const summary = { deadlineMissed: 0, itemsMissed: 0, followUps: 0, reminders: 0, digests: 0 };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // "Due today" must fire today — date-only values are stored at local
  // midnight, so compare follow-ups against tonight's boundary, not `now`.
  const endOfToday = new Date(today.getTime() + 86400000);

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    const organizationId = org.id;

    // ── (a) overdue tasks ─────────────────────────────────────
    const overdueTasks = await prisma.task.findMany({
      where: {
        organizationId, deletedAt: null,
        status: { not: "DONE" },
        dueDate: { lt: today },
      },
      select: {
        id: true, title: true, dueDate: true, projectId: true,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
      },
    });
    for (const t of overdueTasks) {
      const link = t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`;
      for (const a of t.assignees) {
        // idempotent per task+user (JobRun guards per-day; this guards re-runs via force)
        const dup = await prisma.notification.findFirst({
          where: { userId: a.userId, type: "DEADLINE_MISSED", link, createdAt: { gte: today } },
          select: { id: true },
        });
        if (dup) continue;
        await notify({
          organizationId, userId: a.userId,
          type: "DEADLINE_MISSED",
          title: `Deadline missed: "${t.title}"`,
          body: `Was due ${t.dueDate!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
          link,
        });
        summary.deadlineMissed++;
      }
    }
    // summary to managers/heads
    if (overdueTasks.length > 0) {
      const managers = await prisma.user.findMany({
        where: {
          organizationId, isActive: true,
          OR: [{ role: { in: ["MANAGER", "ADMIN", "OWNER"] } }, { designation: "HEAD_OF_DESIGN" }],
        },
        select: { id: true },
      });
      for (const mgr of managers) {
        const dup = await prisma.notification.findFirst({
          where: { userId: mgr.id, type: "DEADLINE_SUMMARY", createdAt: { gte: today } },
          select: { id: true },
        });
        if (dup) continue;
        await notify({
          organizationId, userId: mgr.id,
          type: "DEADLINE_SUMMARY",
          title: `${overdueTasks.length} task${overdueTasks.length !== 1 ? "s" : ""} past deadline`,
          body: overdueTasks.slice(0, 5).map((t) => t.title).join(" · "),
          link: "/reports",
        });
      }
    }

    // ── (b) unposted content past date → MISSED ───────────────
    const lapsed = await prisma.contentItem.findMany({
      where: {
        organizationId,
        date: { lt: today },
        status: { notIn: ["POSTED", "MISSED"] },
      },
      select: { id: true, topic: true, status: true, clientId: true, client: { select: { name: true } } },
    });
    if (lapsed.length) {
      const smmPoc = await prisma.user.findMany({
        where: { organizationId, isActive: true, designation: { in: ["SMM", "POC"] } },
        select: { id: true },
      });
      for (const item of lapsed) {
        await prisma.contentItem.update({ where: { id: item.id }, data: { status: "MISSED" } });
        await logStatus({
          organizationId, entityType: "CONTENT_ITEM", entityId: item.id,
          from: item.status, to: "MISSED", userId: null, note: "auto: past date without posting",
        });
        await notifyMany(smmPoc.map((u) => u.id), {
          organizationId,
          type: "CONTENT_MISSED",
          title: `"${item.topic}" (${item.client.name}) missed its date`,
          body: "Open the client's content calendar to carry it forward.",
          link: `/clients/${item.clientId}?tab=content`,
        });
        summary.itemsMissed++;
      }
    }

    // ── (c) due follow-ups ────────────────────────────────────
    const dueFollowUps = await prisma.followUp.findMany({
      where: {
        organizationId,
        OR: [
          { status: "PENDING", dueAt: { lt: endOfToday } },
          { status: "SNOOZED", snoozedTo: { lt: endOfToday } },
        ],
      },
      include: { client: { select: { id: true, name: true } } },
    });
    for (const f of dueFollowUps) {
      const dup = await prisma.notification.findFirst({
        where: { userId: f.assignedToId, type: "FOLLOWUP_DUE", link: `/clients/${f.clientId}`, createdAt: { gte: today } },
        select: { id: true },
      });
      if (dup) continue;
      await notify({
        organizationId, userId: f.assignedToId,
        type: "FOLLOWUP_DUE",
        title: `Follow up with ${f.client.name}`,
        body: f.note,
        link: `/clients/${f.clientId}`,
      });
      summary.followUps++;
    }

    // ── (d) event reminders ───────────────────────────────────
    summary.reminders += await scanUpcomingEvents(now, organizationId);

    // ── digests ───────────────────────────────────────────────
    const isMonday = now.getDay() === 1;
    const isFirstOfMonth = now.getDate() === 1;

    // Daily digest: each member's own misses (only when they have any)
    const byUser = new Map<string, string[]>();
    for (const t of overdueTasks) {
      for (const a of t.assignees) {
        byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), t.title]);
      }
    }
    for (const [userId, titles] of byUser) {
      const dup = await prisma.notification.findFirst({
        where: { userId, type: "DIGEST_DAILY", createdAt: { gte: today } },
        select: { id: true },
      });
      if (dup) continue;
      await notify({
        organizationId, userId,
        type: "DIGEST_DAILY",
        title: `Daily digest — ${titles.length} overdue item${titles.length !== 1 ? "s" : ""}`,
        body: titles.slice(0, 8).join("\n"),
        link: "/tasks",
      });
      summary.digests++;
    }

    if (isMonday) {
      // Weekly: team roll-up grouped by assignee → heads + managers
      const lines = [...byUser.entries()].map(([userId, titles]) => {
        const name = overdueTasks
          .flatMap((t) => t.assignees)
          .find((a) => a.userId === userId)?.user.name ?? "Unknown";
        return `${name}: ${titles.length} overdue`;
      });
      if (lines.length) {
        const heads = await prisma.user.findMany({
          where: {
            organizationId, isActive: true,
            OR: [{ role: { in: ["MANAGER", "ADMIN", "OWNER"] } }, { designation: "HEAD_OF_DESIGN" }],
          },
          select: { id: true },
        });
        await notifyMany(heads.map((h) => h.id), {
          organizationId,
          type: "DIGEST_WEEKLY",
          title: "Weekly team digest",
          body: lines.join("\n"),
          link: "/reports",
        });
        summary.digests += heads.length;
      }
    }

    if (isFirstOfMonth) {
      // Monthly: client-wise roll-up → admins + POC-designated users
      const missedByClient = await prisma.contentItem.groupBy({
        by: ["clientId"],
        where: {
          organizationId, status: "MISSED",
          date: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: today },
        },
        _count: { _all: true },
      });
      if (missedByClient.length) {
        const clients = await prisma.client.findMany({
          where: { id: { in: missedByClient.map((r) => r.clientId) } },
          select: { id: true, name: true },
        });
        const nameById = new Map(clients.map((c) => [c.id, c.name]));
        const body = missedByClient
          .sort((a, b) => b._count._all - a._count._all)
          .map((r) => `${nameById.get(r.clientId) ?? r.clientId}: ${r._count._all} missed`)
          .join("\n");
        const admins = await prisma.user.findMany({
          where: {
            organizationId, isActive: true,
            OR: [{ role: { in: ["ADMIN", "OWNER"] } }, { designation: "POC" }],
          },
          select: { id: true },
        });
        await notifyMany(admins.map((a) => a.id), {
          organizationId,
          type: "DIGEST_MONTHLY",
          title: "Monthly client digest",
          body,
          link: "/reports",
        });
        summary.digests += admins.length;
      }
    }
  }

  return { ran: true, summary };
}
