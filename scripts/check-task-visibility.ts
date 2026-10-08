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
  /** The role of each user id involved, for the seniority clauses. */
  roles?: Record<string, Role>;
};

const ME = "me";
const OTHER = "other";

/** Interprets the Prisma filter taskVisibilityScope returns, on a fake row. */
function serverWouldReturn(user: { id: string; role: Role }, task: TestTask): boolean {
  const scope = taskVisibilityScope(user) as Record<string, unknown>;
  if (!scope || Object.keys(scope).length === 0) return true; // {} = everything

  // A user with no role declared on the task is treated as a junior — the
  // least-privilege default the real query would land on too.
  const roleOf = (userId: string | null | undefined): Role =>
    (userId && task.roles?.[userId]) || "TEAM";

  const clause = (c: Record<string, any>): boolean => {
    if (c.AND) return (c.AND as Record<string, any>[]).every(clause);
    if (c.OR) return (c.OR as Record<string, any>[]).some(clause);
    if (c.NOT) return !clause(c.NOT);

    // assignee, by id or by role
    if (c.assignees?.some?.userId !== undefined) {
      return task.assignees.some((a) => a.userId === c.assignees.some.userId);
    }
    if (c.assignees?.some?.user?.role?.in !== undefined) {
      const roles: Role[] = c.assignees.some.user.role.in;
      return task.assignees.some((a) => roles.includes(roleOf(a.userId)));
    }

    // manager, by id or by role
    if (c.managerId !== undefined) return task.managerId === c.managerId;
    if (c.manager?.role?.in !== undefined) {
      const roles: Role[] = c.manager.role.in;
      return task.managerId != null && roles.includes(roleOf(task.managerId));
    }

    // approver, by id or by role
    if (c.approverId !== undefined) return task.approverId === c.approverId;
    if (c.approver?.role?.in !== undefined) {
      const roles: Role[] = c.approver.role.in;
      return task.approverId != null && roles.includes(roleOf(task.approverId));
    }

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
  Reading the board is its own capability now, rather than a side effect of
  being able to run a project. But it does not look UPWARD: a manager does not
  read an admin's list, nor an SMM a manager's. Only owner and admin, with
  nobody above them, see the board whole — an empty scope, "no restriction".
*/
const seesAll = (role: Role) =>
  Object.keys(taskVisibilityScope({ id: ME, role })).length === 0;
for (const role of ["OWNER", "ADMIN"] as Role[]) {
  check(`${role.padEnd(7)} sees the whole board`, seesAll(role), true);
}
for (const role of ["MANAGER", "SMM", "TEAM"] as Role[]) {
  check(`${role.padEnd(7)} is scoped, not unrestricted`, seesAll(role), false);
}
check("a junior is still scoped to their own work",
  serverWouldReturn({ id: ME, role: "TEAM" }, TASKS[4]), false);

console.log("");
console.log("— a junior does not read a senior's task list —");
/*
  The rule the whole change is for: an SMM must not see an admin's tasks, a
  manager must not see an owner's. A task on a more-senior person's plate is
  hidden — UNLESS the viewer is part of it, which no seniority overrides.
*/
const RANK: Record<Role, number> = { OWNER: 3, ADMIN: 3, MANAGER: 2, SMM: 1, TEAM: 0 };
// A task that is somebody's alone, by role. Nobody junior is on it.
const ownedBy = (role: Role): TestTask => ({
  name: `${role}'s own task`,
  assignees: [{ userId: `u-${role}` }],
  roles: { [`u-${role}`]: role },
});
for (const viewer of ["MANAGER", "SMM"] as Role[]) {
  for (const owner of ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"] as Role[]) {
    const senior = RANK[owner] > RANK[viewer];
    check(`${viewer.padEnd(7)} ${senior ? "cannot" : "can    "} see a ${owner}'s task`,
      serverWouldReturn({ id: ME, role: viewer }, ownedBy(owner)), !senior);
  }
}
// Owner and admin are peers at the top: each still sees the other's.
check("an admin still sees an owner's task",
  serverWouldReturn({ id: ME, role: "ADMIN" }, ownedBy("OWNER")), true);
// Involvement beats seniority, every way in.
check("an SMM sees an admin's task they are assigned to",
  serverWouldReturn({ id: ME, role: "SMM" },
    { name: "admin task, I'm on it",
      assignees: [{ userId: ME }, { userId: "u-ADMIN" }],
      roles: { "u-ADMIN": "ADMIN" } }), true);
check("...one they delegated",
  serverWouldReturn({ id: ME, role: "SMM" },
    { name: "admin task, I manage it",
      assignees: [{ userId: "u-ADMIN" }], managerId: ME,
      roles: { "u-ADMIN": "ADMIN" } }), true);
check("...and one they are set to review",
  serverWouldReturn({ id: ME, role: "SMM" },
    { name: "admin task, I approve", assignees: [{ userId: "u-ADMIN" }], approverId: ME,
      roles: { "u-ADMIN": "ADMIN" } }), true);

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

console.log("");
console.log("— a task made on a project belongs to it —");
/*
  The project page offers four ways to add a task: the header button, a Kanban
  column, the list, and adding a subtask. All four open the same modal, and the
  modal decides where to POST from whether it was handed a projectId:

    given one  → /api/projects/<id>/tasks, which reads the project from the
                 PATH and writes that, so a request body cannot override it
    given none → /api/tasks, where the project is whatever the body says, and
                 "nothing" is a valid answer there

  So one missing prop would turn every task created on a project page into a
  loose one. Nothing would throw, nothing would look wrong, and the task would
  simply not be on the project — the kind of thing found weeks later by
  somebody asking where their work went.
*/
const projectPageSource = readFileSync("app/(dashboard)/projects/[id]/page.tsx", "utf8");
check("the project page hands the modal its project",
  /<TaskModal[\s\S]*?projectId=\{id\}/.test(projectPageSource), true);

const taskModalSource = readFileSync("components/tasks/TaskModal.tsx", "utf8");
check("and the modal posts to the project's own route when it has one",
  taskModalSource.includes("/api/projects/${projectId}/tasks"), true);

const projectTasksRoute = readFileSync("app/api/projects/[id]/tasks/route.ts", "utf8");
check("which takes the project from the path, not the body",
  /const \{ id: projectId \} = await params;/.test(projectTasksRoute), true);

console.log(fails === 0 ? "\nAll task-visibility checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
