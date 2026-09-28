/**
 * The Head of Design, and the people they lead.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is a narrow grant hung off a JOB TITLE rather than a role. The Head of
 * Design in this workspace holds the TEAM role — a junior one — and this adds
 * exactly two things to it:
 *
 *   · they may hand work to designers
 *   · they may see designers' work
 *
 * And nothing else. They do not approve anybody's work, do not gain the
 * Head-of-Design approval queue (which is a separate, older mechanism keyed
 * on User.designation), do not see money, and cannot assign to or see anybody
 * outside design. A junior with one extra reach, not a manager.
 *
 * WHY THE TWO SIDES ARE MATCHED DIFFERENTLY
 *
 * The head is matched by slug, because there is one of them and the pairing
 * is fixed. Their people are matched by a FLAG on the job title, because an
 * agency might call them Designer, or Graphic Designer and Motion Designer,
 * and all of those are the head's — so which titles count is theirs to tick
 * in Settings, not mine to hardcode.
 *
 * WHY IT IS NOT A CAPABILITY
 *
 * Capabilities answer "may this ROLE do this". This answers "may this PERSON
 * reach that PERSON", and the answer depends on the other person's job title.
 * Putting it in the matrix would have meant a row that reads true for TEAM
 * and is then false for almost every TEAM member.
 */

/** The one title that leads. Matched on slug, which slugify() produces. */
export const DESIGN_HEAD_SLUG = "head-of-design";

export type WithJobTitle = {
  jobTitle?: { slug?: string | null; isDesign?: boolean | null } | null;
};

/** Is this person the Head of Design? */
export function isDesignHead(user: WithJobTitle | null | undefined): boolean {
  return user?.jobTitle?.slug === DESIGN_HEAD_SLUG;
}

/**
 * Is this person one of the designers?
 *
 * The head is deliberately NOT one of their own designers: they are the head.
 * It matters because the same function decides what they can see, and folding
 * them in would have been harmless, while folding them into "who may I assign
 * to" would let them route work to themselves through a rule meant for
 * handing it out.
 */
export function isDesigner(user: WithJobTitle | null | undefined): boolean {
  return !!user?.jobTitle?.isDesign && !isDesignHead(user);
}

/**
 * May a design head hand work to this person?
 *
 * Themselves, or a designer. Everybody else is somebody else's to brief.
 */
export function designHeadMayAssignTo(
  actor: (WithJobTitle & { id?: string | null }) | null | undefined,
  target: (WithJobTitle & { id?: string | null }) | null | undefined,
): boolean {
  if (!isDesignHead(actor)) return false;
  if (actor?.id && target?.id && actor.id === target.id) return true;
  return isDesigner(target);
}

/**
 * The Prisma fragment for "tasks belonging to a designer".
 *
 * Expressed as a relation filter rather than a list of user ids, so no query
 * is needed to build it and it stays correct when somebody's title changes
 * between one request and the next.
 */
export function designTasksScope() {
  return {
    assignees: { some: { user: { jobTitle: { isDesign: true } } } },
  };
}
