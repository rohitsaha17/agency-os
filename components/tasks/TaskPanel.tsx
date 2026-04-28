"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, ChevronDown, Trash2, ExternalLink,
  MessageSquare, GitBranch, Clock, Settings2,
  CheckCircle2, Circle, Timer, Eye, EyeOff, Ban, AlertCircle,
  Activity, Paperclip, Send, Users, Sparkles, Loader2,
} from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { CommentThread } from "./CommentThread";
import { DependencyList } from "./DependencyList";
import { TimeTracker } from "./TimeTracker";
import { TaskUpdates } from "./TaskUpdates";
import { TaskFiles } from "./TaskFiles";
import type { Task, TaskStatus, Priority, User } from "@/types";

type Tab = "details" | "updates" | "files" | "comments" | "dependencies" | "time";

const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "TODO",        label: "To Do",       icon: <Circle className="w-3.5 h-3.5 text-gray-400" />,          color: "text-gray-500"   },
  { value: "IN_PROGRESS", label: "In Progress", icon: <span className="w-3.5 h-3.5 rounded-full bg-blue-500 inline-block" />, color: "text-blue-600" },
  { value: "IN_REVIEW",   label: "In Review",   icon: <Eye className="w-3.5 h-3.5 text-amber-500" />,            color: "text-amber-600"  },
  { value: "DONE",        label: "Done",        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />, color: "text-emerald-600" },
  { value: "BLOCKED",     label: "Blocked",     icon: <Ban className="w-3.5 h-3.5 text-red-500" />,              color: "text-red-600"    },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" },
];

function SelectField({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-800">
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function AssigneePicker({ users, assigneeIds, managerId, onChangeAssignees, onChangeManager }: {
  users: User[]; assigneeIds: string[]; managerId: string;
  onChangeAssignees: (ids: string[]) => void; onChangeManager: (id: string) => void;
}) {
  if (users.length === 0) return <p className="text-xs text-gray-400 italic col-span-2">No team members yet.</p>;
  const toggle = (userId: string) =>
    onChangeAssignees(assigneeIds.includes(userId) ? assigneeIds.filter((id) => id !== userId) : [...assigneeIds, userId]);
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Manager / Reviewer</label>
        <div className="relative">
          <select value={managerId} onChange={(e) => onChangeManager(e.target.value)}
            className="w-full appearance-none px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-800">
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Assignees</label>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => (
            <button key={u.id} onClick={() => toggle(u.id)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                assigneeIds.includes(u.id)
                  ? "bg-indigo-100 border-indigo-300 text-indigo-700 font-medium"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

interface TaskPanelProps {
  task: Task;
  allTasks: Task[];
  projectId: string;
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

export function TaskPanel({ task, allTasks, projectId, onClose, onUpdated, onDeleted }: TaskPanelProps) {
  const [tab, setTab] = useState<Tab>("details");
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [managerId, setManagerId] = useState(task.manager?.id ?? "");
  const [assigneeIds, setAssigneeIds] = useState(task.assignees.map((a) => a.userId));
  const [estimated, setEstimated] = useState(task.estimatedHours?.toString() ?? "");
  const [logged, setLogged] = useState(task.loggedHours);
  const [isClientVisible, setIsClientVisible] = useState(task.isClientVisible ?? false);
  const [showSubtasksToClient, setShowSubtasksToClient] = useState(task.showSubtasksToClient ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCascade, setShowCascade] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<{ estimatedHours: number; reasoning: string; confidence: string } | null>(null);

  const handleAIEstimate = async () => {
    setAiEstimating(true);
    setAiEstimate(null);
    try {
      const res = await fetch("/api/ai/estimate-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: title,
          taskDescription: description,
          priority,
          hasSubtasks: (task.children?.length ?? 0) > 0,
          parentTaskTitle: allTasks.find((t) => t.id === task.parentId)?.title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiEstimate(data);
      }
    } catch { /* ignore */ }
    finally { setAiEstimating(false); }
  };

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((data) => { if (Array.isArray(data)) setUsers(data); });
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const markDirty = useCallback(() => setDirty(true), []);

  const hasChildren = (task.children?.length ?? 0) > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), description: description.trim() || null,
          status, priority, dueDate: dueDate || null,
          managerId: managerId || null, assigneeIds,
          estimatedHours: estimated || null,
          isClientVisible, showSubtasksToClient,
        }),
      });
      const data = await res.json();
      if (res.ok) { onUpdated({ ...task, ...data, isClientVisible, showSubtasksToClient }); setDirty(false); }
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (newStatus: TaskStatus, cascade = false) => {
    if (newStatus === "DONE" && hasChildren && !cascade) {
      setPendingStatus(newStatus);
      setShowCascade(true);
      return;
    }
    setStatus(newStatus);
    setShowCascade(false);
    setPendingStatus(null);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, ...(cascade && { cascadeToChildren: true }) }),
    });
    onUpdated({ ...task, status: newStatus });
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onDeleted(task.id);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "details",      label: "Details",    icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: "updates",      label: "Updates",    icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "files",        label: "Files",      icon: <Paperclip className="w-3.5 h-3.5" /> },
    { id: "comments",     label: "Discussion", icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "dependencies", label: "Depends",    icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: "time",         label: "Time",       icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-[520px] bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="relative group mt-0.5 flex-shrink-0">
              <button title={`Status: ${status}`}>
                {STATUS_OPTIONS.find((s) => s.value === status)?.icon}
              </button>
              <div className="absolute top-6 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[150px] hidden group-hover:block">
                {STATUS_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${status === opt.value ? `font-semibold ${opt.color}` : "text-gray-700"}`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }}
              className="flex-1 text-base font-semibold text-gray-900 border-none outline-none bg-transparent focus:ring-0 p-0 placeholder:text-gray-400"
              placeholder="Task title" />

            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 mt-2 ml-7 flex-wrap">
            <PriorityBadge priority={priority} />
            {dueDate && (
              <span className={`text-xs flex items-center gap-1 ${new Date(dueDate) < new Date() && status !== "DONE" ? "text-red-500" : "text-gray-400"}`}>
                {new Date(dueDate) < new Date() && status !== "DONE" && <AlertCircle className="w-3 h-3" />}
                Due {new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {task.estimatedHours && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {logged > 0 ? `${logged}h / ` : ""}{task.estimatedHours}h est.
              </span>
            )}
            <button
              onClick={() => { setIsClientVisible((v) => !v); markDirty(); }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                isClientVisible ? "bg-sky-50 text-sky-600 border-sky-200" : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
              }`}
              title={isClientVisible ? "Visible to client — click to hide" : "Hidden from client — click to show"}
            >
              {isClientVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isClientVisible ? "Client visible" : "Hidden"}
            </button>
          </div>

          {status !== "IN_REVIEW" && status !== "DONE" && (
            <div className="mt-2.5 ml-7">
              <button onClick={() => handleStatusChange("IN_REVIEW")}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors">
                <Send className="w-3 h-3" />
                Send for Review
              </button>
            </div>
          )}
        </div>

        {/* Cascade prompt */}
        {showCascade && pendingStatus === "DONE" && (
          <div className="mx-5 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex-shrink-0">
            <p className="text-xs font-semibold text-emerald-800 mb-1">Also mark subtasks as done?</p>
            <p className="text-xs text-emerald-600 mb-2.5">
              This task has {task.children?.length} subtask{(task.children?.length ?? 0) !== 1 ? "s" : ""}.
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleStatusChange("DONE", true)}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                Yes, mark all done
              </button>
              <button onClick={() => handleStatusChange("DONE", false)}
                className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Just this task
              </button>
              <button onClick={() => { setShowCascade(false); setPendingStatus(null); }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0 px-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">

          {tab === "details" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                <textarea value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }}
                  rows={4} placeholder="Add a description, requirements, or notes…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <div className="relative">
                    <select value={status} onChange={(e) => { const s = e.target.value as TaskStatus; setStatus(s); handleStatusChange(s); }}
                      className="w-full appearance-none px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-800">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <SelectField label="Priority" value={priority} onChange={(v) => { setPriority(v as Priority); markDirty(); }} options={PRIORITY_OPTIONS} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); markDirty(); }}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* AI Hour Estimation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500">Estimated Hours</label>
                  <button
                    onClick={handleAIEstimate}
                    disabled={aiEstimating}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-50"
                  >
                    {aiEstimating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Estimate
                  </button>
                </div>
                <input type="number" step="0.5" min="0" value={estimated}
                  onChange={(e) => { setEstimated(e.target.value); markDirty(); }}
                  placeholder="e.g. 4"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {aiEstimate && (
                  <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-indigo-900">
                        AI suggests: {aiEstimate.estimatedHours}h
                      </span>
                      <span className="text-[10px] text-indigo-500">
                        {aiEstimate.confidence} confidence
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700 leading-relaxed mb-2">{aiEstimate.reasoning}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEstimated(aiEstimate.estimatedHours.toString()); markDirty(); setAiEstimate(null); }}
                        className="text-[11px] px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                      >
                        Apply {aiEstimate.estimatedHours}h
                      </button>
                      <button
                        onClick={() => setAiEstimate(null)}
                        className="text-[11px] px-2.5 py-1 text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <AssigneePicker users={users} assigneeIds={assigneeIds} managerId={managerId}
                  onChangeAssignees={(ids) => { setAssigneeIds(ids); markDirty(); }}
                  onChangeManager={(id) => { setManagerId(id); markDirty(); }} />
              </div>

              {/* Client visibility */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">Client Visibility</span>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div onClick={() => { setIsClientVisible((v) => !v); markDirty(); }}
                    className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${isClientVisible ? "bg-sky-500" : "bg-gray-300"}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isClientVisible ? "translate-x-4" : ""}`} />
                  </div>
                  <span className="text-xs text-gray-700">Show this task to client</span>
                </label>
                {isClientVisible && (
                  <label className="flex items-center gap-2.5 cursor-pointer select-none ml-4">
                    <div onClick={() => { setShowSubtasksToClient((v) => !v); markDirty(); }}
                      className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${showSubtasksToClient ? "bg-sky-500" : "bg-gray-300"}`}>
                      <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${showSubtasksToClient ? "translate-x-4" : ""}`} />
                    </div>
                    <span className="text-xs text-gray-600">Also show subtasks</span>
                  </label>
                )}
              </div>

              {task.parentId && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Subtask of: {allTasks.find((t) => t.id === task.parentId)?.title ?? "Parent task"}
                </div>
              )}
            </div>
          )}

          {tab === "updates"      && <TaskUpdates taskId={task.id} />}
          {tab === "files"        && <TaskFiles taskId={task.id} projectId={projectId} />}
          {tab === "comments"     && <CommentThread taskId={task.id} />}
          {tab === "dependencies" && <DependencyList taskId={task.id} allTasks={allTasks.filter((t) => t.id !== task.id)} />}
          {tab === "time"         && <TimeTracker taskId={task.id} estimatedHours={task.estimatedHours} loggedHours={logged} onUpdate={(est, log) => { setLogged(log); if (est !== null) setEstimated(est.toString()); }} />}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 px-5 py-4 flex items-center justify-between">
          <button onClick={handleDelete} disabled={deleting}
            className={`flex items-center gap-1.5 text-xs transition-colors ${confirmDelete ? "text-red-600 font-semibold" : "text-gray-400 hover:text-red-500"}`}>
            <Trash2 className="w-3.5 h-3.5" />
            {confirmDelete ? "Confirm delete?" : "Delete task"}
          </button>
          {confirmDelete && (
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-3">Cancel</button>
          )}
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors ml-auto">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
