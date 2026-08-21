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

/**
 * Does this kind of work end in something being published?
 *
 * A reel or a post goes out on a date, so approving one creates a posting task
 * for the SMM, due the day it publishes — that's how the plan keeps track of
 * whether it actually went live. A photo shoot doesn't get posted; it feeds
 * other work, and giving the SMM "Post the monthly product shoot" is a task
 * nobody can complete honestly.
 *
 * Matched on the type's name because creative types are defined per agency.
 * The default is deliberately YES: a spurious task can be closed, whereas a
 * missing one means a post quietly never goes out, which is the failure this
 * is meant to catch.
 */
const NOT_PUBLISHED = /\b(shoot|shot|photography|session|bts|raw)\b/i;

export function isPublishable(creativeTypeName: string | null | undefined): boolean {
  const name = (creativeTypeName ?? "").trim();
  if (!name) return true;
  return !NOT_PUBLISHED.test(name);
}
