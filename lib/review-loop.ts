/**
 * v3 Phase 5 — the accountability loop (docs/V3_CONTEXT.md §3).
 *
 * Nothing is "done" because someone said so. Work is SUBMITTED with proof,
 * REVIEWED, and either approved — which creates the posting task — or sent
 * back as a new round with the original brief untouched.
 *
 *   submit()         assignee hands in, task → IN_REVIEW
 *   approve()        task → DONE, content → APPROVED, POST task created
 *   requestChanges() revision +1, task → CHANGES_REQUESTED, brief intact
 *   markPosted()     the POST task closes, content → POSTED
 */
import { prisma } from "@/lib/prisma";
import { isPublishable } from "@/lib/content-status";
import { logStatus } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { ApiError } from "@/lib/api-errors";

export type SubmissionMethod = "LINK" | "FILE_UPLOAD" | "WHATSAPP" | "SLACK" | "OTHER";

/**
 * The junior hands work in.
 *
 * A submission with neither proof nor a remark is refused — "I did it" with
 * nothing attached is exactly what this loop exists to prevent.
 */
export async function submit(opts: {
  taskId: string;
  organizationId: string;
  userId: string;
  method: SubmissionMethod;
  url?: string | null;
  fileId?: string | null;
  remarks?: string | null;
}) {
  const task = await prisma.task.findFirst({
    where: { id: opts.taskId, organizationId: opts.organizationId, deletedAt: null },
    select: {
      id: true, status: true, revision: true, approverId: true, title: true,
      contentItemId: true, clientId: true,
      client: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new ApiError("Task not found", 404);

  const remarks = opts.remarks?.trim() || null;
  const hasProof = !!(opts.url?.trim() || opts.fileId);
  if (!hasProof && !remarks) {
    throw new ApiError(
      "Say how the work was delivered — attach a link or file, or leave a remark",
      400,
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.taskDelivery.create({
      data: {
        taskId: task.id,
        revision: task.revision,
        method: opts.method,
        url: opts.url?.trim() || null,
        fileId: opts.fileId || null,
        note: remarks,
        deliveredById: opts.userId,
      },
    }),
    prisma.task.update({
      where: { id: task.id },
      data: { status: "IN_REVIEW", submittedAt: now },
    }),
    ...(task.contentItemId
      ? [prisma.contentItem.update({
          where: { id: task.contentItemId },
          data: { status: "SUBMITTED", submittedAt: now },
        })]
      : []),
  ]);

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "TASK",
    entityId: task.id,
    from: task.status,
    to: "IN_REVIEW",
    userId: opts.userId,
    note: `submitted (round ${task.revision})${remarks ? ` — ${remarks}` : ""}`,
  });

  if (task.approverId) {
    await notify({
      organizationId: opts.organizationId,
      userId: task.approverId,
      type: "TASK_IN_REVIEW",
      title: `Ready for review: ${task.title}`,
      body: `${task.client?.name ?? "Work"} — round ${task.revision}`,
      link: `/tasks?tab=approvals&task=${task.id}`,
    });
  }

  return { revision: task.revision };
}

/**
 * The approver accepts the round.
 *
 * Approving is what creates the SMM's own posting task — the work isn't
 * finished until it's live, and that step belongs to whoever approved it.
 */
export async function approve(opts: {
  taskId: string;
  organizationId: string;
  userId: string;
  comments?: string | null;
}) {
  const task = await prisma.task.findFirst({
    where: { id: opts.taskId, organizationId: opts.organizationId, deletedAt: null },
    select: {
      id: true, status: true, revision: true, title: true, projectId: true,
      clientId: true, cycleId: true, contentItemId: true,
      client: { select: { name: true } },
      assignees: { select: { userId: true } },
      contentItem: { select: { id: true, topic: true, date: true, status: true } },
    },
  });
  if (!task) throw new ApiError("Task not found", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.taskReview.create({
      data: {
        taskId: task.id,
        revision: task.revision,
        decision: "APPROVED",
        comments: opts.comments?.trim() || null,
        reviewedById: opts.userId,
      },
    }),
    prisma.task.update({
      where: { id: task.id },
      data: { status: "DONE", approvedAt: now },
    }),
    ...(task.contentItemId
      ? [prisma.contentItem.update({
          where: { id: task.contentItemId },
          data: { status: "APPROVED", approvedAt: now },
        })]
      : []),
  ]);

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "TASK",
    entityId: task.id,
    from: task.status,
    to: "DONE",
    userId: opts.userId,
    note: `approved (round ${task.revision})`,
  });

  for (const a of task.assignees) {
    await notify({
      organizationId: opts.organizationId,
      userId: a.userId,
      type: "TASK_APPROVED",
      title: `Approved: ${task.title}`,
      body: opts.comments?.trim() || null,
      link: `/tasks?task=${task.id}`,
    });
  }

  // The posting task — due on the day the content actually publishes.
  let postTaskId: string | null = null;
  if (task.contentItem) {
    postTaskId = await createPostTask({
      organizationId: opts.organizationId,
      contentItemId: task.contentItem.id,
      userId: opts.userId,
    });
  }

  return { postTaskId };
}

/**
 * The approver sends it back.
 *
 * The SAME task reopens — revision + 1, original brief untouched, the
 * comments pinned. Creating a fresh task would lose the history, which is
 * the whole point of tracking rounds.
 */
export async function requestChanges(opts: {
  taskId: string;
  organizationId: string;
  userId: string;
  comments: string;
}) {
  const comments = opts.comments?.trim();
  if (!comments) throw new ApiError("Say what needs changing", 400);

  const task = await prisma.task.findFirst({
    where: { id: opts.taskId, organizationId: opts.organizationId, deletedAt: null },
    select: {
      id: true, status: true, revision: true, title: true, contentItemId: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new ApiError("Task not found", 404);

  const nextRevision = task.revision + 1;

  await prisma.$transaction([
    prisma.taskReview.create({
      data: {
        taskId: task.id,
        revision: task.revision,
        decision: "CHANGES_REQUESTED",
        comments,
        reviewedById: opts.userId,
      },
    }),
    prisma.task.update({
      where: { id: task.id },
      data: { status: "CHANGES_REQUESTED", revision: nextRevision, submittedAt: null },
    }),
    ...(task.contentItemId
      ? [prisma.contentItem.update({
          where: { id: task.contentItemId },
          data: { status: "CHANGES_REQUESTED", submittedAt: null },
        })]
      : []),
  ]);

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "TASK",
    entityId: task.id,
    from: task.status,
    to: "CHANGES_REQUESTED",
    userId: opts.userId,
    note: `changes requested (round ${task.revision}) — ${comments}`,
  });

  for (const a of task.assignees) {
    await notify({
      organizationId: opts.organizationId,
      userId: a.userId,
      type: "TASK_CHANGES_REQUESTED",
      title: `Changes requested: ${task.title}`,
      body: comments,
      link: `/tasks?task=${task.id}`,
    });
  }

  return { revision: nextRevision };
}

/**
 * "Post <topic> — <client>", for whoever approved the work.
 *
 * Idempotent: approving twice (or a re-review) doesn't stack up posting tasks.
 */
export async function createPostTask(opts: {
  organizationId: string;
  contentItemId: string;
  userId: string;
}): Promise<string | null> {
  const item = await prisma.contentItem.findUnique({
    where: { id: opts.contentItemId },
    select: {
      id: true, topic: true, date: true, clientId: true, projectId: true, cycleId: true,
      client: { select: { name: true } },
      creativeType: { select: { name: true } },
    },
  });
  if (!item) return null;

  // A shoot isn't posted — it feeds other work. Creating "Post the monthly
  // product shoot" gives the SMM a task nobody can honestly complete.
  if (!isPublishable(item.creativeType?.name)) return null;

  const existing = await prisma.task.findFirst({
    where: { contentItemId: item.id, kind: "POST", deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const task = await prisma.task.create({
    data: {
      organizationId: opts.organizationId,
      projectId: item.projectId,
      clientId: item.clientId,
      contentItemId: item.id,
      cycleId: item.cycleId,
      kind: "POST",
      title: `Post ${item.topic} — ${item.client.name}`,
      description: "Approved and ready. Publish it, then mark this done.",
      status: "TODO",
      // Due the day it publishes — not before, not after.
      dueDate: item.date,
      assignees: { create: [{ userId: opts.userId }] },
    },
    select: { id: true },
  });

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "TASK",
    entityId: task.id,
    to: "TODO",
    userId: opts.userId,
    note: "auto-created — approved work needs posting",
  });
  await notify({
    organizationId: opts.organizationId,
    userId: opts.userId,
    type: "TASK_ASSIGNED",
    title: `Post ${item.topic}`,
    body: `${item.client.name} — publishes ${item.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    link: `/tasks?task=${task.id}`,
  });

  return task.id;
}

/**
 * The posting task is done: the content is live.
 * Optionally records where it went, which is what a client asks for later.
 */
export async function markPosted(opts: {
  taskId: string;
  organizationId: string;
  userId: string;
  liveUrl?: string | null;
}) {
  const task = await prisma.task.findFirst({
    where: { id: opts.taskId, organizationId: opts.organizationId, deletedAt: null },
    select: { id: true, status: true, kind: true, contentItemId: true, title: true },
  });
  if (!task) throw new ApiError("Task not found", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { status: "DONE" },
    }),
    ...(task.contentItemId
      ? [prisma.contentItem.update({
          where: { id: task.contentItemId },
          data: {
            status: "POSTED",
            postedAt: now,
            ...(opts.liveUrl?.trim() ? { referenceUrl: opts.liveUrl.trim() } : {}),
          },
        })]
      : []),
  ]);

  await logStatus({
    organizationId: opts.organizationId,
    entityType: "TASK",
    entityId: task.id,
    from: task.status,
    to: "DONE",
    userId: opts.userId,
    note: opts.liveUrl?.trim() ? `posted — ${opts.liveUrl.trim()}` : "posted",
  });
  if (task.contentItemId) {
    await logStatus({
      organizationId: opts.organizationId,
      entityType: "CONTENT_ITEM",
      entityId: task.contentItemId,
      to: "POSTED",
      userId: opts.userId,
      note: "posted",
    });
  }

  return { posted: true };
}

/**
 * The round trail for one task: who submitted what, who said what, when.
 * Interleaved so the drawer can render it as the conversation it is.
 */
export async function roundHistory(taskId: string) {
  const [submissions, reviews] = await Promise.all([
    prisma.taskDelivery.findMany({
      where: { taskId },
      orderBy: { deliveredAt: "asc" },
      include: {
        deliveredBy: { select: { id: true, name: true } },
        file: { select: { id: true, name: true, url: true } },
      },
    }),
    prisma.taskReview.findMany({
      where: { taskId },
      orderBy: { reviewedAt: "asc" },
      include: { reviewedBy: { select: { id: true, name: true } } },
    }),
  ]);

  const rounds = new Map<number, {
    revision: number;
    submission: (typeof submissions)[number] | null;
    review: (typeof reviews)[number] | null;
  }>();
  for (const s of submissions) {
    rounds.set(s.revision, { revision: s.revision, submission: s, review: null });
  }
  for (const r of reviews) {
    const round = rounds.get(r.revision) ?? { revision: r.revision, submission: null, review: null };
    round.review = r;
    rounds.set(r.revision, round);
  }
  return [...rounds.values()].sort((a, b) => a.revision - b.revision);
}
