import type { ContentStatus } from "@/types";

/**
 * Content whose brief is settled and must not change underneath people.
 *
 * Once a piece is approved, the approval refers to a specific brief, topic and
 * reference. Letting someone rewrite those afterwards means the recorded
 * approval no longer describes what was approved — and once it's scheduled or
 * posted, the work is out in the world and the plan is a record of what
 * happened, not a form.
 *
 * Everything before that stays editable, including IN_REVIEW: a reviewer
 * asking for changes often needs to sharpen the brief at the same time.
 */
const SETTLED: ReadonlySet<string> = new Set<ContentStatus>([
  "APPROVED",
  "TEAM_APPROVED",
  "CLIENT_APPROVED",
  "SCHEDULED",
  "POSTED",
]);

export function isSettled(status: string | null | undefined): boolean {
  return !!status && SETTLED.has(status);
}

/** Why it's locked, for the person looking at it. */
export function settledReason(status: string | null | undefined): string {
  switch (status) {
    case "POSTED":    return "This has been posted — the plan now records what went out.";
    case "SCHEDULED": return "This is scheduled to go out; unschedule it to make changes.";
    case "APPROVED":
    case "TEAM_APPROVED":
    case "CLIENT_APPROVED":
      return "This was approved against the brief below. Editing it would leave the approval describing something else.";
    default:          return "This item can no longer be edited.";
  }
}
