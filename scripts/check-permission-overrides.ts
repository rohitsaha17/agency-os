/**
 * Per-workspace role permissions.
 *
 *   npx tsx scripts/check-permission-overrides.ts
 *
 * This decides who may do what, from a free-form JSON column. Two things have
 * to hold whatever is in that column:
 *
 *   1. An owner or admin always holds everything. A workspace that can strip
 *      its own administrators can be locked out of itself, with nobody left
 *      able to undo it.
 *   2. Nothing that is not a role this build names, and a capability this
 *      build names, and a boolean, can reach an answer.
 *
 * Both are asserted below against deliberately hostile input, because the
 * column is data and data is not to be trusted with a question like this.
 */
import { readFileSync } from "fs";
import {
  can, capabilityMatrix, parsePermissionOverrides, isGranted, withOverride,
  OVERRIDABLE_ROLES, ALL_CAPABILITIES,
  type PermissionOverrides, type Capability,
} from "../lib/permissions";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

/** A user as can() receives one, with the workspace attached. */
const asUser = (role: string, permissions?: unknown) =>
  ({ id: "u1", role, organization: { permissions } });

const DEFAULTS = capabilityMatrix().matrix;

console.log("— a workspace that has changed nothing is unchanged —");
for (const role of ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"] as const) {
  const same = ALL_CAPABILITIES.every(
    (c) => can(asUser(role), c) === DEFAULTS[role][c],
  );
  check(`${role.padEnd(7)} matches the matrix`, same, true);
}
check("and so does a user with no organization at all",
  can({ id: "u1", role: "MANAGER" }, "projects.manage"), DEFAULTS.MANAGER["projects.manage"]);

console.log("");
console.log("— what a workspace changes, takes —");
check("granting an SMM the money view",
  can(asUser("SMM", { SMM: { "financials.view": true } }), "financials.view"), true);
check("...changes nothing for TEAM",
  can(asUser("TEAM", { SMM: { "financials.view": true } }), "financials.view"), false);
check("revoking a manager's projects",
  can(asUser("MANAGER", { MANAGER: { "projects.manage": false } }), "projects.manage"), false);
check("...and leaves their other capabilities alone",
  can(asUser("MANAGER", { MANAGER: { "projects.manage": false } }), "clients.manage"), true);
check("granting TEAM something it never had",
  can(asUser("TEAM", { TEAM: { "hr.records": true } }), "hr.records"), true);

console.log("");
console.log("— an administrator cannot be demoted by data —");
const STRIP_ADMINS = {
  OWNER: Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, false])),
  ADMIN: Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, false])),
};
check("an owner still holds everything",
  ALL_CAPABILITIES.every((c) => can(asUser("OWNER", STRIP_ADMINS), c)), true);
check("an admin still holds everything",
  ALL_CAPABILITIES.every((c) => can(asUser("ADMIN", STRIP_ADMINS), c)), true);
check("their columns are not even parsed",
  Object.keys(parsePermissionOverrides(STRIP_ADMINS)), []);
check("OWNER and ADMIN are not offered as adjustable",
  OVERRIDABLE_ROLES.includes("ADMIN" as never), false);

console.log("");
console.log("— nothing unrecognised reaches an answer —");
const HOSTILE: [string, unknown][] = [
  ["null", null],
  ["a string", "MANAGER"],
  ["an array", [{ MANAGER: { "users.manage": true } }]],
  ["a role nobody defined", { SUPERUSER: { "users.manage": true } }],
  ["a capability nobody defined", { TEAM: { "everything.always": true } }],
  ["a capability that is nearly one", { TEAM: { "users.manage ": true } }],
  ["a string instead of a boolean", { TEAM: { "users.manage": "true" } }],
  ["the number one", { TEAM: { "users.manage": 1 } }],
  ["a nested object", { TEAM: { "users.manage": { yes: true } } }],
  ["an array of capabilities", { TEAM: ["users.manage"] }],
  ["__proto__ as a role", JSON.parse('{"__proto__":{"users.manage":true}}')],
  ["constructor as a role", { constructor: { "users.manage": true } }],
];
for (const [label, raw] of HOSTILE) {
  check(`refused: ${label}`, can(asUser("TEAM", raw), "users.manage"), false);
}
check("and a junior is still a junior after all of that",
  HOSTILE.every(([, raw]) => !can(asUser("TEAM", raw), "financials.view")), true);
check("a valid grant beside an invalid one still lands",
  can(asUser("TEAM", { TEAM: { "nope.nope": true, "hr.today": true } }), "hr.today"), true);

console.log("");
console.log("— the board and the notebook are different permissions —");
/*
  tasks.viewAll is the task board: who is doing what. tasks.viewPersonal is
  somebody's own reminders, which nobody assigned and which were written on
  the understanding that they were private.

  An SMM holds the first and not the second, and that gap is the whole point
  of there being two capabilities rather than one.
*/
check("an SMM sees the board", can(asUser("SMM"), "tasks.viewAll"), true);
check("...and not the notebook", can(asUser("SMM"), "tasks.viewPersonal"), false);
check("a manager sees both",
  can(asUser("MANAGER"), "tasks.viewAll") && can(asUser("MANAGER"), "tasks.viewPersonal"), true);
check("an admin sees both",
  can(asUser("ADMIN"), "tasks.viewAll") && can(asUser("ADMIN"), "tasks.viewPersonal"), true);
check("a junior sees neither",
  can(asUser("TEAM"), "tasks.viewAll") || can(asUser("TEAM"), "tasks.viewPersonal"), false);
check("and a workspace can take the notebook back off its managers",
  can(asUser("MANAGER", { MANAGER: { "tasks.viewPersonal": false } }), "tasks.viewPersonal"), false);

check("the audit trail belongs to the people who would be asked about it",
  ["OWNER", "ADMIN", "MANAGER"].every((r) => can(asUser(r), "activity.view")), true);
check("...and not to the people doing the work",
  can(asUser("SMM"), "activity.view") || can(asUser("TEAM"), "activity.view"), false);

console.log("");
console.log("— the delta stays a delta —");
const none: PermissionOverrides = {};
const granted = withOverride(none, "SMM", "financials.view", true);
check("a change away from the default is stored",
  granted, { SMM: { "financials.view": true } });
check("setting it back to the default removes it, rather than pinning it",
  withOverride(granted, "SMM", "financials.view", false), {});
check("a redundant change is never written",
  withOverride(none, "TEAM", "users.manage", false), {});
check("changes to different roles coexist",
  withOverride(granted, "TEAM", "hr.today", true),
  { SMM: { "financials.view": true }, TEAM: { "hr.today": true } });

console.log("");
console.log("— the SMM project scope still sits on top —");
// Granting content.plan does not make an SMM a planner on projects that are
// not theirs; the scope check runs after the grant, as it always did.
check("an SMM plans their own project",
  can(asUser("SMM"), "content.plan", { ownsProject: true }), true);
check("...and not somebody else's, even when the workspace grants it",
  can(asUser("SMM", { SMM: { "content.plan": true } }), "content.plan", { ownsProject: false }), false);

console.log("");
console.log("— isGranted is the same answer, without a user —");
check("defaults through isGranted",
  ALL_CAPABILITIES.every((c) => isGranted("MANAGER", c) === DEFAULTS.MANAGER[c]), true);
check("an override through isGranted",
  isGranted("TEAM", "hr.records" as Capability, { TEAM: { "hr.records": true } }), true);
check("and an admin, whatever is passed",
  isGranted("ADMIN", "users.manage", { MANAGER: { "users.manage": false } }), true);

console.log("");
console.log("— starting a project is not planning one —");
/*
  Creating a project used to take content.plan, which an SMM holds. So the
  role that plans a project's content could also create the project, pick the
  client and set it going — two different decisions wearing one capability.

  Every door is checked, not only the API. The page, the projects list, the
  client page and the dashboard shortcut each decide whether to OFFER the
  button, and a button that is offered and then refused is its own bug.
*/
check("an SMM cannot start a project", can(asUser("SMM"), "projects.manage"), false);
check("nor can a junior", can(asUser("TEAM"), "projects.manage"), false);
check("a manager can", can(asUser("MANAGER"), "projects.manage"), true);
check("and an SMM still plans content", can(asUser("SMM"), "content.plan"), true);

const CREATION_DOORS = [
  "app/api/projects/route.ts",
  "app/(dashboard)/projects/new/page.tsx",
  "app/(dashboard)/projects/page.tsx",
  "app/(dashboard)/clients/[id]/page.tsx",
];
for (const door of CREATION_DOORS) {
  check(
    `${door.split("/").pop()} gates creating on projects.manage`,
    readFileSync(door, "utf8").includes("projects.manage"),
    true,
  );
}

console.log(fails === 0 ? "\nAll permission-override checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
