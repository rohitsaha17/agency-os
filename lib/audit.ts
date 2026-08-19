// v2 universal status audit (docs/V2_CONTEXT.md Prime Directive):
// EVERY status change of anything (task, project, content item, cycle,
// invoice, contract, …) must be written to StatusHistory through logStatus.

import { prisma } from "@/lib/prisma";

export type StatusEntityType =
  | "TASK"
  | "PROJECT"
  | "CONTENT_ITEM"
  | "BOOKING"
  | "INVOICE"
  | "CONTRACT"
  | "EXPENSE"
  | "QUOTATION"
  | "FILE";

export interface LogStatusArgs {
  organizationId: string;
  entityType: StatusEntityType;
  entityId: string;
  from?: string | null;
  to: string;
  userId?: string | null;
  note?: string | null;
}

/**
 * Append one StatusHistory row. Never throws — an audit failure must not
 * break the mutation it records (it is logged to the server console instead).
 */
export async function logStatus(args: LogStatusArgs): Promise<void> {
  try {
    await prisma.statusHistory.create({
      data: {
        organizationId: args.organizationId,
        entityType: args.entityType,
        entityId: args.entityId,
        fromStatus: args.from ?? null,
        toStatus: args.to,
        changedById: args.userId ?? null,
        note: args.note ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] logStatus failed:", err);
  }
}
