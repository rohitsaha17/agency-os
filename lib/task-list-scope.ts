/**
 * Whose task list a task belongs on.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * The server decides what you may SEE (taskVisibilityScope in
 * lib/api-permissions.ts). It returns a task to anyone who is one of: an
 * assignee, the manager, the approver, or the SMM on its project.
 *
 * The page then decides whose list you are LOOKING AT. That second step used
 * to keep only tasks whose assignee list contained the target — so everything
 * the server returned for the other three reasons was fetched and thrown
 * away. An SMM assigned a task, the person they assigned it to got a
 * notification, and the task was nowhere on the SMM's own page. The same held
 * for a manager's own list, and for anybody supervising work they are not
 * personally doing.
 *
 * The two steps must agree: if the server was willing to return a row for
 * you, your own list is where it goes.
 *
 * It is a pure function, away from the component, so the rule can be asserted
 * directly for every role rather than only observed through a browser.
 */

export type ScopeAssignee = {
  userId: string;
  user?: { id: string } | null;
  acceptance?: string | null;
};

export type ScopeTask = {
  assignees?: ScopeAssignee[] | null;
  manager?: { id: string } | null;
  managerId?: string | null;
  approverId?: string | null;
};

/** The viewer's own assignment row on this task, if they have one. */
export function assignmentFor(task: ScopeTask, userId: string): ScopeAssignee | undefined {
  return task.assignees?.find((a) => a.userId === userId || a.user?.id === userId);
}

/**
 * Should `task` appear on `targetId`'s list, as viewed by `viewerId`?
 *
 * Two audiences, deliberately different:
 *
 * Your OWN list is everything that is yours to answer for — work assigned to
 * you, plus work you delegated or review. Declined work drops off, because
 * you said you cannot take it and the only thing left to do with it is
 * decline it again; it stays on the task and in its history.
 *
 * SOMEBODY ELSE'S list is what is on their plate, which is the assignee
 * question and nothing else. A planner looking at a person's list is asking
 * what that person is carrying, not what they handed out. Declined work stays
 * visible there, because that is precisely what needs reassigning.
 */
export function belongsOnList(
  task: ScopeTask,
  targetId: string,
  viewerId: string | null | undefined,
): boolean {
  const isOwnList = !!viewerId && targetId === viewerId;
  const mine = assignmentFor(task, targetId);

  if (!mine) {
    // Delegated or supervised. Only ever on your own list.
    if (!isOwnList) return false;
    const managerId = task.manager?.id ?? task.managerId ?? null;
    return managerId === targetId || task.approverId === targetId;
  }

  return !(isOwnList && mine.acceptance === "DECLINED");
}
