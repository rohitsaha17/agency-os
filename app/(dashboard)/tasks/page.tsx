"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search, AlertCircle, Clock, CheckCircle2, Calendar,
  FolderKanban, Users, Plus, GripVertical, Sparkles, ShieldCheck,
  ChevronDown, ListTodo,
} from "lucide-react";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { StatusBadge } from "@/components/ui/Badge";
import { TaskModal } from "@/components/tasks/TaskModal";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";
import type { Task, TaskStatus, Priority } from "@/types";

// ── Types ────────────────────────────────────────────────────

type Group = "overdue" | "today" | "week" | "upcoming" | "none" | "general" | "done";
type PageTab = "all" | "mine" | "approvals";

const GROUP_CONFIG: Record<Group, { label: string; icon: React.ReactNode; bg: string }> = {
  overdue:  { label: "Overdue",       icon: <AlertCircle className="w-4 h-4 text-red-500" />,     bg: "border-red-200 bg-red-50" },
  today:    { label: "Due Today",     icon: <Clock className="w-4 h-4 text-orange-500" />,         bg: "border-orange-200 bg-orange-50" },
  week:     { label: "Due This Week", icon: <Calendar className="w-4 h-4 text-blue-500" />,        bg: "border-blue-200 bg-blue-50" },
  upcoming: { label: "Upcoming",      icon: <Calendar className="w-4 h-4 text-indigo-500" />,      bg: "border-indigo-200 bg-indigo-50" },
  none:     { label: "No Due Date",   icon: <Clock className="w-4 h-4 text-gray-400" />,           bg: "border-gray-200 bg-gray-50" },
  general:  { label: "General",       icon: <Sparkles className="w-4 h-4 text-purple-500" />,      bg: "border-purple-200 bg-purple-50" },
  done:     { label: "Completed",     icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, bg: "border-emerald-200 bg-emerald-50" },
};

interface FlatTask extends Task {
  projectName?: string;
  clientName?: string;
  clientRefId?: string;
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

function isGeneral(task: Task): boolean {
  return !task.projectId && !task.clientId;
}

function getGroup(task: Task): Group {
  if (task.status === "DONE") return "done";
  if (isGeneral(task)) return "general";
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

// ── Component ────────────────────────────────────────────────

function TasksPageInner() {
  const { user: currentUser } = useCurrentUser();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<PageTab>("all");
  const [allTasks, setAllTasks] = useState<FlatTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [deliveryFor, setDeliveryFor] = useState<FlatTask | null>(null);

  // Approvals
  const [approvals, setApprovals] = useState<FlatTask[] | null>(null);
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  // My-queue drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [myOrder, setMyOrder] = useState<string[] | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  // Reference data
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

  const canFilterByUser = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER" || currentUser?.role === "OWNER";
  const isHead =
    currentUser?.designation === "HEAD_OF_DESIGN" ||
    currentUser?.role === "ADMIN" || currentUser?.role === "OWNER";

  // Deep link: /tasks?tab=approvals
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "approvals" || t === "mine") setTab(t as PageTab);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(d => setTeamUsers(Array.isArray(d) ? d : []));
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projRes = await fetch("/api/projects");
      const projects = await projRes.json();
      if (!projRes.ok) throw new Error(projects.error?.message || "Failed to load");
      const projectsArray: ProjectSummary[] = Array.isArray(projects) ? projects : [];
      setProjectsList(projectsArray);

      const projectMap = new Map(projectsArray.map((p) => [p.id, p]));
      const res = await fetch("/api/tasks?includeCompleted=true&all=1");
      const raw = await res.json();
      if (!res.ok) throw new Error(raw?.error?.message || "Failed to load tasks");
      const list: Task[] = Array.isArray(raw) ? raw : [];

      const seen = new Set<string>();
      const flat: FlatTask[] = [];
      for (const t of list) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const proj = t.projectId ? projectMap.get(t.projectId) : undefined;
        flat.push({
          ...t,
          projectName: proj?.name ?? "",
          clientName: proj?.client?.name ?? t.client?.name ?? "",
          clientRefId: proj?.clientId ?? proj?.client?.id ?? t.clientId ?? "",
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

  const fetchApprovals = useCallback(async () => {
    if (!isHead) return;
    const res = await fetch("/api/tasks/approvals");
    if (res.ok) {
      const d = await res.json();
      setApprovals(Array.isArray(d) ? d : []);
    } else {
      setApprovals([]);
    }
  }, [isHead]);

  useEffect(() => { if (tab === "approvals") fetchApprovals(); }, [tab, fetchApprovals]);

  const handleStatusChange = async (task: FlatTask, status: TaskStatus) => {
    // v2: completing goes through the delivery-proof dialog
    if (status === "DONE" && task.status !== "DONE") {
      setDeliveryFor(task);
      return;
    }
    const previous = allTasks;
    setAllTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status } : t));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
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

  const approve = async (taskId: string, assigneeId?: string) => {
    const res = await fetch(`/api/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assigneeId ? { assigneeId } : {}),
    });
    if (res.ok) {
      toast.success(assigneeId ? "Reassigned" : "Approved");
      setReassignFor(null);
      setReassignTo("");
      fetchApprovals();
      fetchTasks();
    } else {
      toast.error("Approval failed");
    }
  };

  // Role-scoped + filtered tasks
  const filtered = allTasks.filter((t) => {
    if (currentUser?.role === "MEMBER") {
      const isAssigned = t.assignees?.some(a => a.userId === currentUser.id || a.user?.id === currentUser.id);
      if (!isAssigned) return false;
    }
    if (filterUserId) {
      const isAssigned = t.assignees?.some(a => a.userId === filterUserId || a.user?.id === filterUserId);
      if (!isAssigned) return false;
    }
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
    if (search && !(t.title ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterProjectId && t.projectId !== filterProjectId) return false;
    if (filterClientId && t.clientRefId !== filterClientId) return false;
    return true;
  });

  // My-queue list (drag-drop by sortOrder)
  const myTasks = allTasks
    .filter((t) =>
      t.status !== "DONE" &&
      t.assignees?.some(a => a.userId === currentUser?.id || a.user?.id === currentUser?.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const orderedMyTasks = myOrder
    ? [...myTasks].sort((a, b) => myOrder.indexOf(a.id) - myOrder.indexOf(b.id))
    : myTasks;

  const persistOrder = async (ids: string[]) => {
    setMyOrder(ids);
    const res = await fetch("/api/tasks/my-order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) toast.error("Failed to save order");
  };

  const onDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = orderedMyTasks.map((t) => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    persistOrder(ids);
    setDragId(null);
  };

  const clientsFromProjects = Array.from(
    new Map(
      projectsList.filter((p) => p.client?.id).map((p) => [p.client!.id, p.client!])
    ).values()
  );

  const groups: Group[] = ["overdue", "today", "week", "upcoming", "none", "general", "done"];
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

  const getAssigneeNames = (task: FlatTask): string[] => {
    if (!task.assignees || task.assignees.length === 0) return [];
    return task.assignees.map(a => a.user?.name ?? "").filter(Boolean);
  };

  const renderTaskRow = (task: FlatTask, idx: number, group?: Group) => {
    const assignees = getAssigneeNames(task);
    return (
      <div
        key={`${task.parentId ?? "root"}-${task.id}`}
        className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
          idx > 0 ? "border-t border-gray-100" : ""
        } ${task.status === "DONE" ? "opacity-60" : ""}`}
      >
        <button
          onClick={() => handleStatusChange(task, task.status === "DONE" ? "TODO" : "DONE")}
          className="flex-shrink-0"
        >
          {task.status === "DONE"
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <div className={`w-4 h-4 rounded-full border-2 ${group === "overdue" ? "border-red-400" : "border-gray-300"}`} />
          }
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm ${task.status === "DONE" ? "line-through text-gray-400" : "text-gray-900 font-medium"}`}>
            {task.title}
            {task.topic && task.topic !== task.title && (
              <span className="text-xs text-gray-400 font-normal ml-2">— {task.topic}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.projectId && task.projectName ? (
              <Link
                href={`/projects/${task.projectId}`}
                className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
              >
                <FolderKanban className="w-3 h-3" />
                {task.projectName}
              </Link>
            ) : isGeneral(task) ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                <Sparkles className="w-2.5 h-2.5" /> General
              </span>
            ) : null}
            {task.clientName && (
              <>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{task.clientName}</span>
              </>
            )}
            {assignees.length > 0 && (
              <>
                <span className="text-xs text-gray-300">·</span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Users className="w-3 h-3" />
                  {assignees.length <= 2 ? assignees.join(", ") : `${assignees[0]} +${assignees.length - 1}`}
                </span>
              </>
            )}
            {task.assignmentStatus === "PENDING_HEAD_APPROVAL" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full">
                Awaiting head approval
              </span>
            )}
          </div>
        </div>

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
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {counts.total} open task{counts.total !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {counts.overdue > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 font-medium">
                <AlertCircle className="w-4 h-4" /> {counts.overdue} overdue
              </span>
            )}
            <button
              onClick={() => setShowNewTask(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Task
            </button>
          </div>
        </div>

        {/* Page tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-[21px]">
          {([
            { id: "all", label: "All Tasks", icon: <ListTodo className="w-3.5 h-3.5" /> },
            { id: "mine", label: "My Tasks", icon: <Users className="w-3.5 h-3.5" /> },
            ...(isHead ? [{ id: "approvals" as PageTab, label: "Approvals", icon: <ShieldCheck className="w-3.5 h-3.5" /> }] : []),
          ] as { id: PageTab; label: string; icon: React.ReactNode }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.icon} {t.label}
              {t.id === "approvals" && approvals && approvals.length > 0 && (
                <span className="min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-semibold text-white bg-amber-500 rounded-full">
                  {approvals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 overflow-auto">
        {/* ── ALL tab ── */}
        {tab === "all" && (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text" placeholder="Search tasks..." value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
                {canFilterByUser && (
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
                <p className="text-sm font-medium text-amber-800">Something went wrong</p>
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
                        {tasks.map((task, idx) => renderTaskRow(task, idx, group))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── MY TASKS tab (drag-drop queue) ── */}
        {tab === "mine" && (
          loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : orderedMyTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
              <p className="text-sm font-medium text-gray-700">Nothing assigned to you — enjoy the calm!</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-3">Drag to reorder your personal queue — the order is saved.</p>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {orderedMyTasks.map((task, idx) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropOn(task.id)}
                    className={`flex items-center gap-2 ${dragId === task.id ? "opacity-40" : ""}`}
                  >
                    <div className="pl-3 cursor-grab text-gray-300 hover:text-gray-500">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1">{renderTaskRow(task, idx)}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── APPROVALS tab ── */}
        {tab === "approvals" && isHead && (
          approvals === null ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ShieldCheck className="w-12 h-12 text-emerald-400 mb-4" />
              <p className="text-sm font-medium text-gray-700">No tasks waiting for assignment approval.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map((t) => (
                <div key={t.id} className="bg-white border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(t as FlatTask & { project?: { name?: string; client?: { name?: string } } }).project?.name ?? t.client?.name ?? "General"}
                        {t.preferredAssignee && (
                          <> · Preferred: <span className="font-medium text-gray-600">{t.preferredAssignee.name}</span></>
                        )}
                        {t.dueDate && <> · Due {formatDate(t.dueDate)}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {reassignFor === t.id ? (
                        <>
                          <div className="relative">
                            <select
                              value={reassignTo}
                              onChange={(e) => setReassignTo(e.target.value)}
                              className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                            >
                              <option value="">Pick person…</option>
                              {teamUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                          <button
                            onClick={() => reassignTo && approve(t.id, reassignTo)}
                            disabled={!reassignTo}
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                          >
                            Assign
                          </button>
                          <button onClick={() => { setReassignFor(null); setReassignTo(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => approve(t.id)}
                            disabled={!t.preferredAssignee}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Approve{t.preferredAssignee ? ` → ${t.preferredAssignee.name}` : ""}
                          </button>
                          <button
                            onClick={() => setReassignFor(t.id)}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                          >
                            Assign someone else
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Global New Task modal */}
      {showNewTask && (
        <TaskModal
          global
          onClose={() => setShowNewTask(false)}
          onSaved={() => { setShowNewTask(false); fetchTasks(); }}
        />
      )}

      {/* Delivery-proof dialog on completion */}
      {deliveryFor && (
        <DeliveryDialog
          taskId={deliveryFor.id}
          taskTitle={deliveryFor.title}
          onClose={() => setDeliveryFor(null)}
          onCompleted={() => { setDeliveryFor(null); fetchTasks(); }}
        />
      )}
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={
      <div className="p-8 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    }>
      <TasksPageInner />
    </Suspense>
  );
}
