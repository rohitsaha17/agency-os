/**
 * The two halves of task visibility, checked against each other.
 *
 *   npx tsx scripts/check-task-visibility.ts
 *
 * The server decides which rows you may receive (taskVisibilityScope). The
 * page decides whose list they land on (belongsOnList). They are written in
 * different files, in different languages of thought — one a Prisma filter,
 * one an array predicate — and nothing forced them to agree.
 *
 * They disagreed. The server returns a task to its manager, its approver and
 * the SMM on its project as well as to its assignees; the page kept only the
 * assignees. So an SMM assigned work, the assignee was notified, and the task
 * was on nobody's page — the assigner's list had dropped it.
 *
 * The rule asserted here is the one that was missing: any row the server
 * hands you BECAUSE IT IS YOURS — you are its assignee, its manager or its
 * approver — is on your own list. Not "the assignee case works", which was
 * true throughout.
 *
 * Access is not ownership, and the fourth reason is the difference. An SMM
 * may read every task on a project they run; those are not theirs and do not
 * go on their personal list, or it would fill with the whole project the
 * moment they were added to it. They reach that work through the project.
 * That exclusion is asserted below too, so it stays a decision rather than
 * quietly becoming a gap again.
 */
import { readFileSync } from "fs";
import { taskVisibilityScope } from "../lib/api-permissions";
import { belongsOnList } from "../lib/task-list-scope";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "SMM" | "TEAM";
const ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"];

type TestTask = {
  name: string;
  assignees: { userId: string; acceptance?: string }[];
  managerId?: string | null;
  approverId?: string | null;
  projectMembers?: { userId: string; role: string }[];
};

const ME = "me";
const OTHER = "other";

/** Interprets the Prisma filter taskVisibilityScope returns, on a fake row. */
function serverWouldReturn(user: { id: string; role: Role }, task: TestTask): boolean {
  const scope = taskVisibilityScope(user) as Record<string, unknown>;
  if (!scope || Object.keys(scope).length === 0) return true; // {} = everything

  const clause = (c: Record<string, any>): boolean => {
    if (c.assignees?.some?.userId !== undefined) {
      return task.assignees.some((a) => a.userId === c.assignees.some.userId);
    }
    if (c.managerId !== undefined) return task.managerId === c.managerId;
    if (c.approverId !== undefined) return task.approverId === c.approverId;
    if (c.project?.members?.some !== undefined) {
      const m = c.project.members.some;
      return (task.projectMembers ?? []).some(
        (pm) => pm.userId === m.userId && pm.role === m.role,
      );
    }
    throw new Error(`check-task-visibility does not understand: ${JSON.stringify(c)}`);
  };

  const or = (scope as { OR?: Record<string, any>[] }).OR;
  return or ? or.some(clause) : clause(scope);
}

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const TASKS: TestTask[] = [
  { name: "assigned to me",            assignees: [{ userId: ME }] },
  { name: "I delegated it (manager)",  assignees: [{ userId: OTHER }], managerId: ME },
  { name: "I approve it",              assignees: [{ userId: OTHER }], approverId: ME },
  { name: "my project, as its SMM",    assignees: [{ userId: OTHER }],
    projectMembers: [{ userId: ME, role: "SMM" }] },
  { name: "nothing to do with me",     assignees: [{ userId: OTHER }] },
  { name: "assigned to me, declined",  assignees: [{ userId: ME, acceptance: "DECLINED" }] },
];

console.log("— anything the server hands you is somewhere you can see it —");
for (const role of ROLES) {
  const user = { id: ME, role };
  for (const task of TASKS) {
    if (!serverWouldReturn(user, task)) continue;
    // Declined work is deliberately off your own list; it stays on the task.
    const declinedByMe = task.assignees.some(
      (a) => a.userId === ME && a.acceptance === "DECLINED",
    );
    // "The server returned it" cannot mean "it is yours": an admin receives
    // every row in the organization, and an SMM receives every row on their
    // projects. The claim is about the three relationships that make a task
    // yours to answer for.
    const isMineSomehow =
      task.assignees.some((a) => a.userId === ME) ||
      task.managerId === ME ||
      task.approverId === ME;
    if (!isMineSomehow) continue;
    if (declinedByMe) continue;

    check(`${role.padEnd(7)} own list keeps: ${task.name}`,
      belongsOnList(task, ME, ME), true);
  }
}

console.log("");
console.log("— who can see what everybody is doing —");
/*
  Reading everybody's work is its own capability now, rather than a side
  effect of being able to run a project. An SMM hands work out all day and
  could not see where any of it went; a junior still sees their own.

  An empty scope means "no restriction" — the whole organization.
*/
const seesAll = (role: Role) =>
  Object.keys(taskVisibilityScope({ id: ME, role })).length === 0;
for (const role of ["OWNER", "ADMIN", "MANAGER", "SMM"] as Role[]) {
  check(`${role.padEnd(7)} sees everybody's tasks`, seesAll(role), true);
}
check("TEAM    does not", seesAll("TEAM"), false);
check("...and is still scoped to their own work",
  serverWouldReturn({ id: ME, role: "TEAM" }, TASKS[4]), false);

console.log("");
console.log("— the regression that started this —");
const delegated = TASKS[1];
check("an SMM sees work they assigned to someone else",
  belongsOnList(delegated, ME, ME), true);
check("...and the server was willing to return it all along",
  serverWouldReturn({ id: ME, role: "SMM" }, delegated), true);
check("a TEAM member sees work they delegated too",
  serverWouldReturn({ id: ME, role: "TEAM" }, delegated) && belongsOnList(delegated, ME, ME), true);

console.log("");
console.log("— and it does not overshoot —");
check("somebody else's task is not on my list",
  belongsOnList(TASKS[4], ME, ME), false);
check("work I declined leaves my own list",
  belongsOnList(TASKS[5], ME, ME), false);
check("...but stays on their list when a planner looks at it",
  belongsOnList(TASKS[5], ME, "a-manager"), true);
// Access without ownership: readable, but not on the personal list.
check("a task on my project that is nobody's of mine stays off my list",
  belongsOnList(TASKS[3], ME, ME), false);
check("...though the server does return it, so the project page has it",
  serverWouldReturn({ id: ME, role: "SMM" }, TASKS[3]), true);

check("somebody else's list is what THEY hold, not what they handed out",
  belongsOnList(delegated, OTHER, ME), true);
check("...so my delegated task is not on their list twice over",
  belongsOnList({ ...delegated, assignees: [] }, OTHER, ME), false);

console.log("");
console.log("— the dashboard counts what the list shows —");
/*
  Two files answer "what is my work": the dashboard's own queries, and
  belongsOnList. They disagreed about declined assignments — the list drops
  them from your own view, the dashboard counted them — so the same person at
  the same moment saw "1 open" on one page and "0 open" on the other, and the
  row they clicked led to a page with nothing on it.

  Asserted against the source, because the disagreement is between a Prisma
  filter and an array predicate and no type can reconcile those two.
*/
const dashboardSource = readFileSync("app/api/dashboard/v3/route.ts", "utf8");
const myWorkFilters = dashboardSource.match(/assignees: \{ some: \{ userId: user\.id[^}]*\}/g) ?? [];
check("the dashboard asks about my own assignments at all",
  myWorkFilters.length > 0, true);
check("and every one of those excludes work I declined",
  myWorkFilters.every((f) => f.includes("DECLINED")), true);
check("which is the rule the list already applied",
  belongsOnList({ assignees: [{ userId: ME, acceptance: "DECLINED" }] }, ME, ME), false);

console.log(fails === 0 ? "\nAll task-visibility checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
