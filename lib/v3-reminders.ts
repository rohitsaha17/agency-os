/**
 * v3 Phase 8 — the time-based nudges (docs/V3_CONTEXT.md §8).
 *
 * Everything else in the loop is event-driven: assigned, submitted, changes
 * requested, approved, cycle closed. These three only make sense on a clock,
 * so they run from the daily scan:
 *
 *   post due today          — the SMM has something to publish
 *   cycle closing in 3 days — close it deliberately, not by drifting past
 *   planning task overdue   — a project nobody has planned yet
 *
 * Each dedupes on the day, so re-running the scan can't spam anyone.
 */
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

/** Has this exact nudge already gone out today? */
async function alreadySentToday(userId: string, type: string, link: string, today: Date) {
  const existing = await prisma.notification.findFirst({
    where: { userId, type, link, createdAt: { gte: today } },
    select: { id: true },
  });
  return !!existing;
}

export async function runV3Reminders(now = new Date()): Promise<Record<string, number>> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const inThreeDays = new Date(today.getTime() + 3 * 86400000);

  let postsDue = 0, cyclesClosing = 0, planningOverdue = 0;

  // ── 1. Posting tasks due today ──
  const posts = await prisma.task.findMany({
    where: {
      deletedAt: null, kind: "POST", status: { not: "DONE" },
      dueDate: { gte: today, lt: tomorrow },
    },
    select: {
      id: true, title: true, organizationId: true,
      client: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
  });
  for (const t of posts) {
    for (const a of t.assignees) {
      const link = `/tasks?task=${t.id}`;
      if (await alreadySentToday(a.userId, "POST_DUE_TODAY", link, today)) continue;
      await notify({
        organizationId: t.organizationId,
        userId: a.userId,
        type: "POST_DUE_TODAY",
        title: `Publishing today: ${t.title}`,
        body: t.client?.name ?? null,
        link,
      });
      postsDue++;
    }
  }

  // ── 2. Cycles closing within three days ──
  const closing = await prisma.projectCycle.findMany({
    where: { status: "OPEN", endDate: { gte: today, lte: inThreeDays } },
    select: {
      id: true, label: true, endDate: true,
      project: {
        select: {
          id: true, name: true, organizationId: true,
          members: { where: { role: "SMM" }, select: { userId: true } },
        },
      },
    },
  });
  for (const c of closing) {
    const daysLeft = Math.max(0, Math.ceil((c.endDate.getTime() - today.getTime()) / 86400000));
    const link = `/projects/${c.project.id}?tab=plan`;
    for (const m of c.project.members) {
      if (await alreadySentToday(m.userId, "CYCLE_CLOSING_SOON", link, today)) continue;
      await notify({
        organizationId: c.project.organizationId,
        userId: m.userId,
        type: "CYCLE_CLOSING_SOON",
        title: `${c.project.name} — ${c.label} ends ${daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}`,
        body: "Carry anything unposted forward and close the cycle.",
        link,
      });
      cyclesClosing++;
    }
  }

  // ── 3. Planning tasks nobody has started ──
  const stalePlanning = await prisma.task.findMany({
    where: {
      deletedAt: null, kind: "PLANNING", status: "TODO",
      dueDate: { lt: today },
    },
    select: {
      id: true, title: true, organizationId: true, projectId: true,
      assignees: { select: { userId: true } },
    },
  });
  for (const t of stalePlanning) {
    const link = t.projectId ? `/projects/${t.projectId}?tab=plan` : `/tasks?task=${t.id}`;
    for (const a of t.assignees) {
      if (await alreadySentToday(a.userId, "PLANNING_OVERDUE", link, today)) continue;
      await notify({
        organizationId: t.organizationId,
        userId: a.userId,
        type: "PLANNING_OVERDUE",
        title: `Still unplanned: ${t.title}`,
        body: "Nothing has been scheduled for this project yet.",
        link,
      });
      planningOverdue++;
    }
  }

  return { postsDue, cyclesClosing, planningOverdue };
}
