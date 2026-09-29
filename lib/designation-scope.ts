/**
 * QA-018: resolve "people who hold a job function" across the v2/v3 split.
 *
 * A person's job function lives in two places depending on when their org was
 * built. v2 wrote the `designation` ENUM on the user. v3 dropped the enum and
 * writes a job-title ROW instead (`designationId` → DesignationRole, matched by
 * its `slug`), leaving the enum null. So a recipient query that filters on the
 * enum alone reaches NOBODY in a v3-created org — which is exactly how
 * content-missed alerts, festival/event reminders and review-outcome notices
 * silently stopped notifying anyone there.
 *
 * This returns the Prisma `where` OR-branches that match a user holding ANY of
 * the given functions under EITHER representation, so the same person is found
 * whichever way their org was set up. It mirrors the pattern already used by
 * `notifyHeads` in lib/task-routing.ts and centralizes it so every recipient
 * query resolves identically.
 *
 * SLUGS. A DesignationRole's slug is `slugify(name)`. Only the ones with a
 * stable, known slug are mapped here:
 *   - HEAD_OF_DESIGN → "head-of-design" (the fixed slug the design-head grant
 *     keys on; see lib/design-head.ts DESIGN_HEAD_SLUG).
 *   - POC            → "poc".
 * SMM is deliberately absent: "smm" is a RESERVED role slug (a job title may
 * not use it — see app/api/designations ROLE_SLUGS), so an SMM in a v3 org is
 * identified by their first-class `role: "SMM"`, which this adds automatically.
 *
 * This changes no business meaning: it only ALSO finds the v3-shaped users a
 * pure-enum filter was missing. A user matching several branches is still
 * returned once by `findMany`.
 */

export type LegacyDesignation =
  | "SMM" | "DESIGNER" | "EDITOR" | "HEAD_OF_DESIGN"
  | "PHOTOGRAPHER" | "SME" | "POC" | "OTHER";

/** Known stable job-title slugs for the enum values that have one. */
const SLUG: Partial<Record<LegacyDesignation, string>> = {
  HEAD_OF_DESIGN: "head-of-design",
  POC: "poc",
};

/**
 * Prisma `User` where OR-branches for "holds one of these functions".
 *
 * Spread into an existing OR, or use as `{ OR: designationBranches([...]) }`.
 * Always pair with `organizationId` / `isActive` in the surrounding `where`.
 */
export function designationBranches(designations: LegacyDesignation[]): object[] {
  const slugs = designations
    .map((d) => SLUG[d])
    .filter((s): s is string => !!s);

  const branches: object[] = [
    // v2 legacy rows still carry the enum.
    { designation: { in: designations } },
  ];
  if (slugs.length) {
    // v3 rows carry a job title with a known slug.
    branches.push({ jobTitle: { slug: { in: slugs } } });
  }
  if (designations.includes("SMM")) {
    // SMM is a first-class role in every org (v2 and v3); the job-title slug
    // "smm" is reserved, so the role is the reliable v3 signal for it.
    branches.push({ role: "SMM" });
  }
  return branches;
}
