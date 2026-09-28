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

console.log(fails === 0 ? "\nAll permission-override checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
