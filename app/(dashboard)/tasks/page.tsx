"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, AlertCircle, Clock, CheckCircle2, Calendar, FolderKanban } from "lucide-react";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { StatusBadge } from "@/components/ui/Badge";
import type { Task, TaskStatus } from "@/types";

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

function getGroup(task: Task): Group {
  if (task.status === "DONE") return "done";
  if (!task.dueDate) return "none";

  const due = new Date(task.dueDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1);
  const weekEnd    = new Date(todayStart.getTime() + 7 * 86400000);

  if (due < todayStart) return "overdue";
  if (due <= todayEnd)  return "today";
  if (due <= weekEnd)   return "week";
  return "upcoming";
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MyTasksPage() {
  const [allTasks, setAllTasks] = useState<FlatTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all projects, then all tasks
      const projRes = await fetch("/api/projects");
      const projects = await projRes.json();
      if (!projRes.ok) throw new Error(projects.error || "Failed to load");

      const projectsArray: ProjectSummary[] = Array.isArray(projects) ? projects : [];
      setProjectsList(projectsArray);

      const taskArrays = await Promise.all(
        projectsArray.map(async (p) => {
          const res = await fetch(`/api/projects/${p.id}/tasks`);
          const tasks = await res.json();
          if (!Array.isArray(tasks)) return [];
          return flattenTasks(tasks).map((t: Task) => ({
            ...t,
            projectName: p.name,
            clientName: p.client?.name ?? "",
            clientId: p.clientId ?? p.client?.id ?? "",
          }));
        })
      );

      setAllTasks(taskArrays.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  function flattenTasks(tasks: Task[]): Task[] {
    return tasks.flatMap((t) => [t, ...flattenTasks(t.children ?? [])]);
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    setAllTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const filtered = allTasks.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterClientId && (t as FlatTask).clientId !== filterClientId) return false;
    return true;
  });

  // Derive unique clients from the projects list for the client dropdown
  const clientsFromProjects = Array.from(
    new Map(
      projectsList
        .filter((p) => p.client?.id)
        .map((p) => [p.client!.id, p.client!])
    ).values()
  );

  const groups: Group[] = ["overdue", "today", "week", "upcoming", "none", "done"];
  const byGroup = (group: Group) => filtered.filter((t) => getGroup(t) === group);

  const counts = {
    total: allTasks.filter((t) => t.status !== "DONE").length,
    overdue: allTasks.filter((t) => getGroup(t) === "overdue").length,
    today: allTasks.filter((t) => getGroup(t) === "today").length,
  };

  const STATUS_FILTERS: { label: string; value: TaskStatus | "ALL" }[] = [
    { label: "All", value: "ALL" },
    { label: "To Do", value: "TODO" },
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "In Review", value: "IN_REVIEW" },
    { label: "Blocked", value: "BLOCKED" },
    { label: "Done", value: "DONE" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">All Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">All tasks across every project</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {counts.overdue > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 font-medium">
                <AlertCircle className="w-4 h-4" />
                {counts.overdue} overdue
              </span>
            )}
            {counts.today > 0 && (
              <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                <Clock className="w-4 h-4" />
                {counts.today} due today
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 overflow-auto">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="Search tasks…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <select
            value={filterClientId}
            onChange={(e) => { setFilterClientId(e.target.value); setFilterProjectId(""); }}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Clients</option>
            {clientsFromProjects.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Projects</option>
            {projectsList
              .filter((p) => !filterClientId || p.client?.id === filterClientId || p.clientId === filterClientId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto flex-wrap">
            {STATUS_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
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
              {search || statusFilter !== "ALL" || filterProjectId || filterClientId ? "No tasks match" : "No open tasks — you're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
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
                    {tasks.map((task, idx) => (
                      <div
                        key={task.id}
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
                          <div className="flex items-center gap-2 mt-0.5">
                            <Link
                              href={`/projects/${task.projectId}`}
                              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                            >
                              <FolderKanban className="w-3 h-3" />
                              {(task as FlatTask).projectName}
                            </Link>
                            {(task as FlatTask).clientName && (
                              <span className="text-xs text-gray-300">·</span>
                            )}
                            <span className="text-xs text-gray-400">{(task as FlatTask).clientName}</span>
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
                    ))}
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
