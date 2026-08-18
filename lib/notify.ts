// v2 in-app notifications — creation helper used by API routes.
// Notification delivery is in-app only for now (docs/V2_CONTEXT.md §4).

import { prisma } from "@/lib/prisma";

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_IN_REVIEW"
  | string;

export interface NotifyArgs {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Create one in-app notification. Never throws — a notification failure
 * must not break the mutation that triggered it.
 */
export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        organizationId: args.organizationId,
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body ?? null,
        link: args.link ?? null,
      },
    });
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}

/** Notify several users at once (skips duplicates in the list). */
export async function notifyMany(
  userIds: Array<string | null | undefined>,
  args: Omit<NotifyArgs, "userId">,
): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  await Promise.all(unique.map((userId) => notify({ ...args, userId })));
}
