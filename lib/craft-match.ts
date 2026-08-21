/**
 * Which crafts suit which kind of work.
 *
 * A photo shoot wants a photographer, not a copywriter, and showing the whole
 * team in that picker makes the SMM read nine names to find the two that make
 * sense. Designations are defined by each agency, though, so this can't be a
 * fixed list of ids — it matches on the words people actually use.
 *
 * Deliberately a suggestion, not a rule: `matchingCrafts` returns null when it
 * recognises nothing, and callers fall back to the full list. Being unable to
 * assign work because a designation was named something unexpected would be a
 * far worse failure than showing one name too many.
 */

/** Creative-type keyword -> designation keywords that can do it. */
const AFFINITY: { when: RegExp; crafts: RegExp }[] = [
  // Anything shot on a camera.
  { when: /\b(photo|shoot|shot|product\s*shoot)\b/i, crafts: /\b(photograph|videograph|camera|dop|cinemat)/i },
  // Motion: reels, videos, edits.
  { when: /\b(reel|video|film|motion|edit)\b/i, crafts: /\b(video|editor|motion|animat|cinemat)/i },
  // Words. Checked before the design rule so "blog post" reaches a writer
  // instead of matching on "post" and landing with a designer.
  { when: /\b(copy|caption|blog|article|script|write|newsletter)\b/i, crafts: /\b(copy|writ|content|script)/i },
  // Static design: posts, carousels, stories, creatives.
  { when: /\b(post|carousel|story|stories|creative|banner|poster|design)\b/i, crafts: /\b(design|graphic|artist|illustrat)/i },
];

/**
 * People whose craft suits `creativeTypeName`, or null when nothing is
 * recognised — in which case show everyone rather than blocking the assign.
 */
export function matchingCrafts<T extends { jobTitle?: { name: string } | null }>(
  creativeTypeName: string | null | undefined,
  people: T[],
): T[] | null {
  const name = (creativeTypeName ?? "").trim();
  if (!name) return null;

  const rule = AFFINITY.find((a) => a.when.test(name));
  if (!rule) return null;

  const matched = people.filter((p) => p.jobTitle?.name && rule.crafts.test(p.jobTitle.name));
  // A rule that matches nobody is worse than no rule at all.
  return matched.length > 0 ? matched : null;
}
