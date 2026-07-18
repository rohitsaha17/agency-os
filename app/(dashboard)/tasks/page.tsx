"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search, AlertCircle, Clock, CheckCircle2, Calendar,
  FolderKanban, Users, Filter,
} from "lucide-react";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { StatusBadge } from "@/components/ui/Badge";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";
import type { Task, TaskStatus, Priority } from "@/types";

// ── Types ────────────────────────────────────────────────────

type Group = "overdue" | "today" | "week" | "upcoming" | "none" | "done";

const GROUP_CONFIG: Record<Group, { label: string; icon: React.ReactNode; bg: string }> = {
  overdue:  { label: "Overdue",       icon: <AlertCircle className="w-4 h-4 text-red-500" />,     bg: "border-red-200 bg-red-50" },
  today:    { label: "Due Today",     icon: <Clock className="w-4 h-4 text-orange-500" />,         bg: "border-orange-200 bg-orange-50" },
  week:     { label: "Due This Week", icon: <Calendar className="w-4 h-4 text-blue-500" />,        bg: "border-blue-200 bg-blue-50" },
  upcoming: { label: "Upcoming",      icon: <Calendar className="w-4 h-4 text-indigo-500" />,      bg: "border-indigo-200 bg-indigo-50" },
  none:     { label: "No Due Date",   icon: <Clock className="w-4 h-4 text-gray-400" />,           bg: "border-gray-200 bg-gray-50" },
  done:     { label: "Completed",     icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, bg: "border-emerald-200 bg-emerald-50" },
};

interface FlatTask extends Task {
  projectId: string;
  projectName?: string;
  clientName?: string;
  clientId?: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  clientId?: string;
  client?: { id: string; name: string };
}

interface TeamUser {
  id: string;
  name: string;
  role: string;
}

// ── Helpers ──────────────────────────────────────────────────

function getGroup(task: Task): Group {
  if (task.status === "DONE") return "done";
  if (!task.dueDate) return "none";
  const due = new Date(task.dueDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
  if (due < todayStart) return "overdue";
  if (due <= todayEnd) return "today";
  if (due <= weekEnd) return "week";
  return "upcoming";
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The API already returns every task (including subtasks) as its own full
// row; each row's `children` array holds {id,status} STUBS only. Recursing
// into those stubs would shadow the real rows with title-less ghosts, so we
// deliberately treat the list as flat.
function flattenTasks(tasks: Task[]): Task[] {
  return tasks;
}

// ── Component ────────────────────────────────────────────────

export default function MyTasksPage() {
  const { user: currentUser } = useCurrentUser();

  const [allTasks, setAllTasks] = useState<FlatTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // Reference data
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

  const canFilterByUser = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  // Fetch team users for admin/manager
  useEffect(() => {
    if (!canFilterByUser) return;
    fetch("/api/users").then(r => r.json()).then(d => setTeamUsers(Array.isArray(d) ? d : []));
  }, [canFilterByUser]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projRes = await fetch("/api/projects");
      const projects = await projRes.json();
      if (!projRes.ok) throw new Error(projects.error?.message || "Failed to load");
      const projectsArray: ProjectSummary[] = Array.isArray(projects) ? projects : [];
      setProjectsList(projectsArray);

      // Single call to the global tasks endpoint — avoids N+1 per-project fetches.
      // /api/tasks supports projectId/clientId/status filters; we pull all open tasks
      // plus completed ones so the "Completed" group on the page still renders.
      // TODO: if/when the API supports a multi-project filter (e.g. ?projects=a,b,c),
      // switch to that for more precise scoping per user role.
      const projectMap = new Map(projectsArray.map((p) => [p.id, p]));
      const res = await fetch("/api/tasks?includeCompleted=true&all=1");
      const raw = await res.json();
      if (!res.ok) throw new Error(raw?.error?.message || "Failed to load tasks");
      const list: Task[] = Array.isArray(raw) ? raw : [];

      // Dedupe by id in case the endpoint ever returns overlapping rows.
      const seen = new Set<string>();
      const flat: FlatTask[] = [];
      for (const t of flattenTasks(list)) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const proj = projectMap.get(t.projectId);
        flat.push({
          ...t,
          projectId: t.projectId,
          projectName: proj?.name ?? (t as FlatTask).projectName ?? "",
          clientName: proj?.client?.name ?? "",
          clientId: proj?.clientId ?? proj?.client?.id ?? "",
        });
      }
      setAllTasks(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    // Snapshot previous state so we can roll back on failure.
    const previous = allTasks;
    setAllTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch {
      setAllTasks(previous);
      toast.error("Failed to update task status");
    }
  };

  // Role-scoped + filtered tasks
  const filtered = allTasks.filter((t) => {
    // Role scoping: MEMBER only sees assigned tasks by default
    if (currentUser?.role === "MEMBER" && !myTasksOnly) {
      // For MEMBER, always scope to their tasks
      const isAssigned = t.assignees?.some(a => a.userId === currentUser.id || a.user?.id === currentUser.id);
      if (!isAssigned) return false;
    }

    // "My Tasks" toggle for ADMIN/MANAGER
    if (myTasksOnly && currentUser) {
      const isAssigned = t.assignees?.some(a => a.userId === currentUser.id || a.user?.id === currentUser.id);
      const isManager = t.manager?.id === currentUser.id;
      if (!isAssigned && !isManager) return false;
    }

    // Member filter (admin/manager filtering by team member)
    if (filterUserId) {
      const isAssigned = t.assignees?.some(a => a.userId === filterUserId || a.user?.id === filterUserId);
      if (!isAssigned) return false;
    }

    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
    if (search && !(t.title ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterClientId && (t as FlatTask).clientId !== filterClientId) return false;
    return true;
  });

  const clientsFromProjects = Array.from(
    new Map(
      projectsList.filter((p) => p.client?.id).map((p) => [p.client!.id, p.client!])
    ).values()
  );

  const groups: Group[] = ["overdue", "today", "week", "upcoming", "none", "done"];
  const byGroup = (group: Group) => filtered.filter((t) => getGroup(t) === group);

  const counts = {
    total: filtered.filter((t) => t.status !== "DONE").length,
    overdue: filtered.filter((t) => getGroup(t) === "overdue").length,
    today: filtered.filter((t) => getGroup(t) === "today").length,
  };

  const STATUS_FILTERS: { label: string; value: TaskStatus | "ALL" }[] = [
    { label: "All", value: "ALL" },
    { label: "To Do", value: "TODO" },
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "In Review", value: "IN_REVIEW" },
    { label: "Blocked", value: "BLOCKED" },
    { label: "Done", value: "DONE" },
  ];

  const PRIORITY_FILTERS: { label: string; value: Priority | "ALL" }[] = [
    { label: "All", value: "ALL" },
    { label: "Urgent", value: "URGENT" },
    { label: "High", value: "HIGH" },
    { label: "Medium", value: "MEDIUM" },
    { label: "Low", value: "LOW" },
  ];

  // Get assignee display for a task
  const getAssigneeNames = (task: FlatTask): string[] => {
    if (!task.assignees || task.assignees.length === 0) return [];
    return task.assignees.map(a => a.user?.name ?? "").filter(Boolean);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {myTasksOnly ? "My Tasks" : currentUser?.role === "MEMBER" ? "My Tasks" : "All Tasks"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {counts.total} open task{counts.total !== 1 ? "s" : ""}
              {filterUserId && teamUsers.length > 0 && ` for ${teamUsers.find(u => u.id === filterUserId)?.name ?? "member"}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {counts.overdue > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 font-medium">
                <AlertCircle className="w-4 h-4" /> {counts.overdue} overdue
              </span>
            )}
            {counts.today > 0 && (
              <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                <Clock className="w-4 h-4" /> {counts.today} due today
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 overflow-auto">
        {/* Filters */}
        <div className="space-y-3">
          {/* Row 1: Search + My Tasks toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" placeholder="Search tasks..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* My Tasks toggle — only for ADMIN/MANAGER */}
            {canFilterByUser && (
              <button
                onClick={() => { setMyTasksOnly(!myTasksOnly); setFilterUserId(""); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  myTasksOnly
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                My Tasks
              </button>
            )}

            {/* Member filter for admin/manager */}
            {canFilterByUser && !myTasksOnly && (
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Members</option>
                {teamUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            )}
          </div>

          {/* Row 2: Project + Client + Status + Priority */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterClientId}
              onChange={(e) => { setFilterClientId(e.target.value); setFilterProjectId(""); }}
              className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Clients</option>
              {clientsFromProjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Projects</option>
              {projectsList
                .filter((p) => !filterClientId || p.client?.id === filterClientId || p.clientId === filterClientId)
                .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Status pills */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Priority pills */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto">
              {PRIORITY_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setPriorityFilter(value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    priorityFilter === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => <div key={j} className="h-10 bg-gray-100 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-amber-800">Database not connected</p>
            <p className="text-xs text-amber-600 mt-1">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
            <p className="text-sm font-medium text-gray-700">
              {search || statusFilter !== "ALL" || priorityFilter !== "ALL" || filterProjectId || filterClientId || filterUserId
                ? "No tasks match your filters"
                : "No open tasks — you're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const tasks = byGroup(group);
              if (tasks.length === 0) return null;
              const cfg = GROUP_CONFIG[group];

              return (
                <div key={group}>
                  <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl mb-3 ${cfg.bg}`}>
                    {cfg.icon}
                    <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
                    <span className="text-xs text-gray-500 ml-auto">{tasks.length}</span>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {tasks.map((task, idx) => {
                      const assignees = getAssigneeNames(task as FlatTask);

                      return (
                        <div
                          key={`${task.parentId ?? "root"}-${task.id}`}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                            idx > 0 ? "border-t border-gray-100" : ""
                          } ${task.status === "DONE" ? "opacity-60" : ""}`}
                        >
                          {/* Status toggle */}
                          <button
                            onClick={() => handleStatusChange(task.id, task.status === "DONE" ? "TODO" : "DONE")}
                            className="flex-shrink-0"
                          >
                            {task.status === "DONE"
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : <div className={`w-4 h-4 rounded-full border-2 ${group === "overdue" ? "border-red-400" : "border-gray-300"}`} />
                            }
                          </button>

                          {/* Task info */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${task.status === "DONE" ? "line-through text-gray-400" : "text-gray-900 font-medium"}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Link
                                href={`/projects/${task.projectId}`}
                                className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                              >
                                <FolderKanban className="w-3 h-3" />
                                {(task as FlatTask).projectName}
                              </Link>
                              {(task as FlatTask).clientName && (
                                <>
                                  <span className="text-xs text-gray-300">·</span>
                                  <span className="text-xs text-gray-400">{(task as FlatTask).clientName}</span>
                                </>
                              )}
                              {/* Assignees */}
                              {assignees.length > 0 && (
                                <>
                                  <span className="text-xs text-gray-300">·</span>
                                  <span className="flex items-center gap-1 text-xs text-gray-400">
                                    <Users className="w-3 h-3" />
                                    {assignees.length <= 2
                                      ? assignees.join(", ")
                                      : `${assignees[0]} +${assignees.length - 1}`
                                    }
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <PriorityBadge priority={task.priority} />
                            <StatusBadge status={task.status} />
                            {task.dueDate && (
                              <span className={`text-xs flex items-center gap-1 ${
                                group === "overdue" ? "text-red-500 font-medium" : "text-gray-400"
                              }`}>
                                <Calendar className="w-3 h-3" />
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
