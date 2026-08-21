/**
 * v3 — tasks the SYSTEM creates, never a human (docs/V3_CONTEXT.md §3).
 *
 * Two of them carry the spine:
 *   1. A project gets an SMM  → PLANNING task, "plan this project".
 *   2. Submitted work is approved → POST task for the SMM (Phase 5).
 *
 * Both are idempotent: creating the same auto-task twice is a bug the user
 * would see as duplicate work, so each checks for an existing open one first.
 */
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { logStatus } from "@/lib/audit";
import { cycleSummary } from "@/lib/cycle-quota";

/**
 * "New client onboarded — plan <project>".
 *
 * Fires when an SMM joins a project, at creation or later. Skipped when that
 * SMM already has an open planning task for the project, so re-saving the
 * project or re-adding the same person doesn't pile them up.
 *
 * Returns the task id, or null when one already existed.
 */
export async function createPlanningTask(opts: {
  organizationId: string;
  projectId: string;
  userId: string;
  createdById?: string | null;
  /**
   * When the plan is wanted by. Set by whoever assigns the SMM; falls back to
   * two days out, which is a guess and shouldn't pretend otherwise.
   */
  planningDueDate?: Date | null;
}): Promise<string | null> {
  const { organizationId, projectId, userId } = opts;

  const existing = await prisma.task.findFirst({
    where: {
      projectId,
      kind: "PLANNING",
      deletedAt: null,
      status: { not: "DONE" },
      assignees: { some: { userId } },
    },
    select: { id: true },
  });
  if (existing) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, clientId: true, type: true,
      client: { select: { name: true } },
      deliverables: {
        select: { qtyPerCycle: true, creativeType: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!project) return null;

  // Spell the deal out in the task body so the SMM knows what they owe
  // before they open the plan.
  const deliverables = project.deliverables
    .map((d) => `${d.qtyPerCycle} × ${d.creativeType.name}`)
    .join(", ");
  const perCycle = project.type === "RETAINER" ? " per month" : "";
  const description = deliverables
    ? `Plan the content for ${project.client.name}. This project owes ${deliverables}${perCycle}.`
    : `Plan the content for ${project.client.name}. No deliverables are set on this project yet.`;

  const dueDate = opts.planningDueDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d;
  })();

  const task = await prisma.task.create({
    data: {
      organizationId,
      projectId,
      clientId: project.clientId,
      kind: "PLANNING",
      title: `New client onboarded — plan ${project.name}`,
      description,
      status: "TODO",
      priority: "HIGH",
      dueDate,
      assignees: { create: [{ userId }] },
    },
    select: { id: true },
  });

  const link = `/projects/${projectId}?tab=plan`;
  await logStatus({
    organizationId,
    entityType: "TASK",
    entityId: task.id,
    to: "TODO",
    userId: opts.createdById ?? null,
    note: "auto-created — project needs planning",
  });
  await notify({
    organizationId,
    userId,
    type: "TASK_ASSIGNED",
    title: `Plan ${project.name}`,
    body: description,
    link,
  });

  return task.id;
}

/**
 * The junior's brief: a CONTENT_WORK task carrying everything the SMM wrote.
 *
 * This is the handoff that makes the spine work — the person doing the job
 * should never have to go hunting for the brief, so topic, content, reference
 * and extra note are all copied onto the task (docs/V3_CONTEXT.md §3).
 *
 * Idempotent per (contentItem, assignee): re-assigning the same person
 * returns the existing task rather than creating a second one.
 */
export async function createContentWorkTask(opts: {
  organizationId: string;
  contentItemId: string;
  assigneeId: string;
  /** The SMM doing the assigning — they review it later. */
  approverId: string;
  /** Defaults to the publish date minus two days. */
  dueDate?: Date | null;
  /**
   * How urgent this piece is. Set by the SMM while planning; without it every
   * task took the schema default and "Medium" meant nothing, because nobody
   * had ever chosen it.
   */
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
}): Promise<string | null> {
  const { organizationId, contentItemId, assigneeId, approverId } = opts;

  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    select: {
      id: true, topic: true, description: true, referenceUrl: true,
      referenceFileId: true, date: true, clientId: true, projectId: true,
      cycleId: true, status: true,
      client: { select: { name: true } },
      creativeType: { select: { name: true } },
    },
  });
  if (!item) return null;

  const existing = await prisma.task.findFirst({
    where: {
      contentItemId,
      deletedAt: null,
      assignees: { some: { userId: assigneeId } },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Due two days before it publishes, so there's room to review and fix.
  const dueDate = opts.dueDate ?? (() => {
    const d = new Date(item.date);
    d.setUTCDate(d.getUTCDate() - 2);
    return d;
  })();

  const task = await prisma.task.create({
    data: {
      organizationId,
      projectId: item.projectId,
      clientId: item.clientId,
      contentItemId: item.id,
      cycleId: item.cycleId,
      kind: "CONTENT_WORK",
      title: item.topic,
      // Everything the SMM wrote, carried across verbatim
      topic: item.topic,
      content: item.description,
      referenceUrl: item.referenceUrl,
      referenceFileId: item.referenceFileId,
      description: item.description,
      status: "TODO",
      priority: opts.priority ?? "MEDIUM",
      dueDate,
      approverId,
      assignees: { create: [{ userId: assigneeId }] },
    },
    select: { id: true },
  });

  // The item is no longer merely planned — someone owns it now.
  if (item.status === "PLANNED") {
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: "ASSIGNED" },
    });
    await logStatus({
      organizationId,
      entityType: "CONTENT_ITEM",
      entityId: item.id,
      from: item.status,
      to: "ASSIGNED",
      userId: approverId,
      note: "assigned",
    });
  }

  await logStatus({
    organizationId,
    entityType: "TASK",
    entityId: task.id,
    to: "TODO",
    userId: approverId,
    note: "assigned from the plan",
  });
  await notify({
    organizationId,
    userId: assigneeId,
    type: "TASK_ASSIGNED",
    title: `${item.creativeType.name}: ${item.topic}`,
    body: `${item.client.name} — due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    link: `/tasks?task=${task.id}`,
  });

  return task.id;
}

/**
 * Keep a project's PLANNING task honest about how far the plan has got.
 *
 * The task the SMM sees is "plan this project", and what "done" means is not a
 * judgement call — it's whether the cycle's quota has been filled. So the task
 * reports progress as planned-against-quota (12/15) and closes itself when the
 * quota is met, rather than asking someone to remember to tick it.
 *
 * Called after anything that changes a cycle's plan. Cheap, and safe to call
 * when there's no planning task: it simply does nothing.
 */
export async function syncPlanningTask(projectId: string, organizationId: string) {
  const task = await prisma.task.findFirst({
    where: { projectId, kind: "PLANNING", deletedAt: null },
    select: { id: true, status: true, progress: true, cycleId: true },
  });
  if (!task) return;

  // The cycle being planned: the task's own, else the project's current open one.
  const cycleId = task.cycleId ?? (await prisma.projectCycle.findFirst({
    where: { projectId, status: "OPEN" },
    orderBy: { startDate: "asc" },
    select: { id: true },
  }))?.id;
  if (!cycleId) return;

  const summary = await cycleSummary(cycleId, organizationId);
  if (!summary) return;

  const { quota, planned } = summary.totals;
  // No quota means nothing to measure against; leave the task alone rather
  // than declaring a project with no deliverables "fully planned".
  if (quota <= 0) return;

  const pct = Math.min(100, Math.round((planned / quota) * 100));
  const complete = planned >= quota;

  if (task.progress === pct && (complete ? task.status === "DONE" : task.status !== "DONE")) {
    return; // nothing changed
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      progress: pct,
      // Reopen if items were removed after it closed — the plan is short again.
      status: complete ? "DONE" : task.status === "DONE" ? "IN_PROGRESS" : task.status,
    },
  });

  if (complete && task.status !== "DONE") {
    await logStatus({
      organizationId,
      entityType: "TASK",
      entityId: task.id,
      from: task.status,
      to: "DONE",
      userId: null,
      note: `plan complete — ${planned}/${quota} planned`,
    });
  }
}
