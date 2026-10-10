/**
 * The Head of Design's reach.
 *
 *   npx tsx scripts/check-design-head.ts
 *
 * This grant hangs off a JOB TITLE rather than a role, which makes it the
 * odd one out in this codebase and worth pinning down. The head holds TEAM —
 * a junior role — and gains exactly two things: they may hand work to
 * designers, and they may see designers' work.
 *
 * Most of what follows is about what they DID NOT gain. A permission is only
 * as good as the things it refuses, and this one sits next to roles that can
 * do a great deal more.
 */
import { readFileSync } from "fs";
import {
  isDesignHead, isDesigner, designHeadMayAssignTo, DESIGN_HEAD_SLUG,
} from "../lib/design-head";
import { canAssignToUser } from "../lib/permissions";
import { taskVisibilityScope } from "../lib/api-permissions";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const title = (slug: string, isDesign = false) => ({ slug, isDesign });

const HEAD = { id: "head", role: "TEAM", jobTitle: title(DESIGN_HEAD_SLUG) };
const DESIGNER = { id: "d1", role: "TEAM", jobTitle: title("designer", true) };
const MOTION = { id: "d2", role: "TEAM", jobTitle: title("motion-designer", true) };
const EDITOR = { id: "e1", role: "TEAM", jobTitle: title("editor") };
const SMM = { id: "s1", role: "SMM", jobTitle: title("social-media") };
const ADMIN = { id: "a1", role: "ADMIN", jobTitle: null };
const NO_TITLE = { id: "n1", role: "TEAM", jobTitle: null };

console.log("— who is who —");
check("the head is recognised by slug", isDesignHead(HEAD), true);
check("a designer is not the head", isDesignHead(DESIGNER), false);
check("somebody with no job title is nobody in particular", isDesignHead(NO_TITLE), false);
check("a ticked title is a designer", isDesigner(DESIGNER), true);
check("any ticked title, not just the one called Designer", isDesigner(MOTION), true);
check("an unticked title is not", isDesigner(EDITOR), false);
check("and the head is not one of their own designers", isDesigner(HEAD), false);

console.log("");
console.log("— who the head may hand work to —");
check("a designer", canAssignToUser(HEAD, DESIGNER), true);
check("any ticked title", canAssignToUser(HEAD, MOTION), true);
check("themselves", canAssignToUser(HEAD, HEAD), true);
check("NOT an editor", canAssignToUser(HEAD, EDITOR), false);
check("NOT an SMM", canAssignToUser(HEAD, SMM), false);
check("NOT an admin", canAssignToUser(HEAD, ADMIN), false);
check("NOT somebody with no job title", canAssignToUser(HEAD, NO_TITLE), false);

console.log("");
console.log("— and nobody else gains anything —");
check("a designer cannot assign to another designer",
  canAssignToUser(DESIGNER, MOTION), false);
check("an editor cannot assign to a designer",
  canAssignToUser(EDITOR, DESIGNER), false);
check("a plain junior still assigns only to themselves",
  canAssignToUser(NO_TITLE, NO_TITLE) && !canAssignToUser(NO_TITLE, DESIGNER), true);
check("an admin still reaches everybody", canAssignToUser(ADMIN, DESIGNER), true);
check("...including people the head cannot", canAssignToUser(ADMIN, SMM), true);

console.log("");
console.log("— what the head may see —");
/*
  An empty scope means "everything". The head must never produce one: they see
  their own work plus their designers', and the test that matters is that the
  scope still carries restrictions at all.
*/
const headScope = taskVisibilityScope(HEAD) as { OR?: object[] };
const juniorScope = taskVisibilityScope(NO_TITLE) as { OR?: object[] };
check("the head's view is still restricted, not opened up",
  Object.keys(headScope).length > 0, true);
// Base `mine` is three clauses now — assigned, managed, approved (approverId
// was added so the server scope agrees with belongsOnList and the dashboard) —
// and the head adds a fourth for their designers' work.
check("it holds their own work, what they manage, what they review, and design",
  headScope.OR?.length, 4);
check("a plain junior's holds only the first three",
  juniorScope.OR?.length, 3);
check("and design is matched by the flag, not by a list of names",
  JSON.stringify(headScope.OR).includes('"isDesign":true'), true);

console.log("");
console.log("— the approval flow is untouched —");
/*
  Explicit, because the obvious next step from "leads the designers" is
  "approves their work", and that was asked for NOT to happen. The head is a
  TEAM member; nothing here gives them tasks.review, and the older
  Head-of-Design approval queue keys on User.designation, which this does not
  set.
*/
const authSource = readFileSync("lib/auth.ts", "utf8");
check("isHeadOfDesign still does not consult the job title",
  /designation === "HEAD_OF_DESIGN"/.test(authSource) && !/jobTitle/.test(
    authSource.slice(authSource.indexOf("export function isHeadOfDesign")),
  ), true);

console.log(fails === 0 ? "\nAll design-head checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
