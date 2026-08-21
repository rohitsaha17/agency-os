"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Trash2, ExternalLink,
  MessageSquare, Settings2,
  CheckCircle2, Circle, Timer, Eye, EyeOff, Ban, AlertCircle, Play,
  Activity, Paperclip, Send, Users, Loader2,
} from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import { CommentThread } from "./CommentThread";
import { RoundHistory } from "@/components/tasks/RoundHistory";
import { TaskFiles } from "./TaskFiles";
import { DeliveryDialog } from "./DeliveryDialog";
import { SubmitWorkDialog } from "./ReviewDialogs";
import { Select } from "@/components/ui/Select";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import type {
  Task, TaskStatus, Priority, User,
  TaskHistoryEntry, TaskDeliveryRecord,
} from "@/types";

/**
 * Four tabs, down from seven.
 *
 * "Updates" and "Discussion" were two feeds of the same thing — a typed update
 * and a comment are the same act to the person writing one — so the round
 * trail moved into Discussion and the separate Updates feed is gone. Depends
 * and Time are removed for now; neither carried its weight next to the
 * submit/review loop.
 *
 * Discussion is the conversation. History is the audit trail. Those are
 * genuinely different, so they stay apart.
 */
type Tab = "details" | "files" | "comments" | "history";

/** ISO instant -> the value a datetime-local input wants (local, no zone). */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Does this deadline actually carry a time?
 *
 * Tasks created before deadlines had a clock were stored as midnight UTC.
 * Rendered in a non-UTC timezone that reads as "5:30 AM", which looks like a
 * deliberate dawn deadline and isn't one. Exactly-midnight-UTC means date only,
 * whatever timezone is looking at it.
 */
function hasClock(d: Date) {
  return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
}

/** A deadline as people say it: "28 Aug 2026, 6:00 pm" — or just the date. */
function formatDeadline(value: string) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  return hasClock(d)
    ? `${date}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : date;
}

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

/** Thin wrapper kept so existing call sites read the same; the control is the
 *  shared Select. */
function SelectField({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
      allowEmpty={!!placeholder}
      placeholder={placeholder ?? "Select…"}
    />
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
          <Select
            value={managerId}
            onChange={(v) => onChangeManager(v)}
            options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: `${u.name}` }))]}
            size="sm"
          />
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
  /** v3: tasks can exist without a project (personal, general). */
  projectId?: string;
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

/** A field a junior may see but not set. Same shape as the editable one. */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <p className="w-full px-2.5 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg truncate">
        {value}
      </p>
    </div>
  );
}

export function TaskPanel({ task, allTasks, projectId, onClose, onUpdated, onDeleted }: TaskPanelProps) {
  const { user: me } = useCurrentUser();
  const [tab, setTab] = useState<Tab>("details");
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  // datetime-local, not date: a deadline of "the 28th" is not the same
  // instruction as "the 28th, 6pm", and the SMM sets the second one.
  const [dueDate, setDueDate] = useState(task.dueDate ? toLocalInput(task.dueDate) : "");
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
  // ── v2 state ──
  const [showDelivery, setShowDelivery] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [cascadeAfterDelivery, setCascadeAfterDelivery] = useState(false);
  const [deliveries, setDeliveries] = useState<TaskDeliveryRecord[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[] | null>(null);
  const [showChangeReq, setShowChangeReq] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [submittingCR, setSubmittingCR] = useState(false);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((data) => { if (Array.isArray(data)) setUsers(data); });
    fetch(`/api/tasks/${task.id}/delivery`).then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setDeliveries(d); }).catch(() => {});
  }, [task.id]);

  useEffect(() => {
    if (tab === "history" && history === null) {
      fetch(`/api/tasks/${task.id}/history`).then((r) => (r.ok ? r.json() : []))
        .then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => setHistory([]));
    }
  }, [tab, history, task.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const markDirty = useCallback(() => setDirty(true), []);

  /**
   * Who owns what on a task.
   *
   * The brief — title, description, priority, due date, assignees, whether the
   * client sees it — belongs to whoever planned the work. An editor moves the
   * task along; they don't rewrite what they were asked to do, or quietly push
   * their own deadline back. So `content.plan` gates every one of those fields
   * and the delete button with them.
   *
   * "Request changes" is a review verdict, not a progress update. It's the
   * reviewer's word on submitted work, so it sits behind `tasks.review` — an
   * assignee can't raise a change request against their own task.
   *
   * What a junior keeps: status, Send for Review, files, discussion, time.
   * That's the whole of their job and none of anyone else's.
   */
  const canPlan   = can(me, "content.plan");

  /**
   * Everyone involved in this task, in the order they matter to a reader:
   * the people doing it, then the person it comes back to. Mirrors what the
   * comments route notifies, so the strip can't claim someone is in the
   * thread who never hears about it.
   */
  const participants = (() => {
    const out: { id: string; name: string; role: string }[] = [];
    for (const a of task.assignees ?? []) {
      if (a.user) out.push({ id: a.user.id, name: a.user.name, role: "Assignee" });
    }
    // Prefer the resolved approver from the payload — the users list is
    // fetched separately and may not have arrived, and a thread that silently
    // omits the reviewer is worse than one that renders a moment late.
    const reviewer =
      task.approver ??
      users.find((u) => u.id === task.approverId) ??
      task.manager ??
      null;
    if (reviewer && !out.some((p) => p.id === reviewer.id)) {
      out.push({ id: reviewer.id, name: reviewer.name, role: "Reviewer" });
    }
    return out;
  })();
  const canReview = can(me, "tasks.review");

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
    if (newStatus === "DONE" && hasChildren && !cascade && !showCascade) {
      setPendingStatus(newStatus);
      setShowCascade(true);
      return;
    }
    // v2: completing a task goes through the Delivery dialog for proof.
    if (newStatus === "DONE" && task.status !== "DONE") {
      setShowCascade(false);
      setPendingStatus(null);
      setCascadeAfterDelivery(cascade);
      setShowDelivery(true);
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

  const handleDelivered = async () => {
    setShowDelivery(false);
    setStatus("DONE");
    if (cascadeAfterDelivery) {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE", cascadeToChildren: true }),
      });
    }
    fetch(`/api/tasks/${task.id}/delivery`).then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setDeliveries(d); }).catch(() => {});
    onUpdated({ ...task, status: "DONE" });
  };

  const submitChangeRequest = async () => {
    if (!changeNote.trim()) return;
    setSubmittingCR(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: changeNote }),
      });
      if (res.ok) {
        setStatus("IN_PROGRESS");
        setShowChangeReq(false);
        setChangeNote("");
        setHistory(null); // refetch lazily
        onUpdated({ ...task, status: "IN_PROGRESS" });
      }
    } finally {
      setSubmittingCR(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onDeleted(task.id);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "details",  label: "Details",    icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: "files",    label: "Files",      icon: <Paperclip className="w-3.5 h-3.5" /> },
    { id: "comments", label: "Discussion", icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "history",  label: "History",    icon: <Activity className="w-3.5 h-3.5" /> },
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

            <input value={title} readOnly={!canPlan}
              onChange={(e) => { if (!canPlan) return; setTitle(e.target.value); markDirty(); }}
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
                Due {formatDeadline(dueDate).replace(/, \d{4}/, "")}
              </span>
            )}
            {task.estimatedHours && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {logged > 0 ? `${logged}h / ` : ""}{task.estimatedHours}h est.
              </span>
            )}
            <button
              disabled={!canPlan}
              onClick={() => { if (!canPlan) return; setIsClientVisible((v) => !v); markDirty(); }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                isClientVisible ? "bg-sky-50 text-sky-600 border-sky-200" : "bg-gray-50 text-gray-400 border-gray-200"
              } ${canPlan ? "hover:border-gray-300" : "cursor-default"}`}
              title={canPlan
                ? (isClientVisible ? "Visible to client — click to hide" : "Hidden from client — click to show")
                : (isClientVisible ? "Visible to client" : "Hidden from client")}
            >
              {isClientVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isClientVisible ? "Client visible" : "Hidden"}
            </button>
          </div>

          {/*
            The task's state is driven by what you actually did, not by picking
            a status off a list. Not started -> Start task. Underway -> Mark
            finished, which asks for the proof and hands it to the reviewer.
            Waiting on a review says so and offers nothing to press.
          */}
          <div className="mt-2.5 ml-7 flex items-center gap-2 flex-wrap">
            {status === "TODO" && (
              <button onClick={() => handleStatusChange("IN_PROGRESS")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                <Play className="w-3 h-3" />
                Start task
              </button>
            )}
            {status === "IN_PROGRESS" && (
              <button onClick={() => setShowSubmit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                <Send className="w-3 h-3" />
                Mark finished
              </button>
            )}
            {status === "IN_REVIEW" && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                <Eye className="w-3 h-3" />
                Waiting on review
              </span>
            )}
            {status === "BLOCKED" && (
              <button onClick={() => handleStatusChange("IN_PROGRESS")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                <Play className="w-3 h-3" />
                Resume task
              </button>
            )}
            {status !== "DONE" && canReview && (
              <button onClick={() => setShowChangeReq(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors">
                <AlertCircle className="w-3 h-3" />
                Request changes
              </button>
            )}
          </div>

          {/* v2: change-request dialog */}
          {showChangeReq && (
            <div className="mt-2.5 ml-7 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-xs font-semibold text-rose-800 mb-1.5">What needs to change?</p>
              <textarea
                autoFocus value={changeNote} onChange={(e) => setChangeNote(e.target.value)} rows={2}
                placeholder="Describe the changes needed…"
                className="w-full px-2.5 py-1.5 text-xs border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={submitChangeRequest} disabled={submittingCR || !changeNote.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors">
                  {submittingCR ? "Sending…" : "Send request"}
                </button>
                <button onClick={() => { setShowChangeReq(false); setChangeNote(""); }}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Cancel
                </button>
              </div>
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
              {/* v2: brief block (topic / content / reference / extra note) */}
              {(task.topic || task.content || task.referenceUrl || task.extraNote) && (
                <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-3 space-y-1.5">
                  {task.topic && (
                    <p className="text-xs"><span className="font-semibold text-indigo-700">Topic:</span>{" "}
                      <span className="text-gray-700">{task.topic}</span></p>
                  )}
                  {task.content && (
                    <p className="text-xs"><span className="font-semibold text-indigo-700">Content:</span>{" "}
                      <span className="text-gray-700 whitespace-pre-wrap">{task.content}</span></p>
                  )}
                  {task.referenceUrl && (
                    <p className="text-xs"><span className="font-semibold text-indigo-700">Reference:</span>{" "}
                      <a href={task.referenceUrl} target="_blank" rel="noreferrer"
                        className="text-indigo-600 underline underline-offset-2 break-all">{task.referenceUrl}</a></p>
                  )}
                  {task.extraNote && (
                    <p className="text-xs"><span className="font-semibold text-indigo-700">Note:</span>{" "}
                      <span className="text-gray-700">{task.extraNote}</span></p>
                  )}
                </div>
              )}

              {/* v2: delivery proof */}
              {deliveries.length > 0 && (
                <div className="border border-emerald-100 bg-emerald-50/60 rounded-xl p-3 space-y-1.5">
                  {deliveries.map((d) => (
                    <div key={d.id} className="text-xs text-emerald-800">
                      <span className="font-semibold">
                        Delivered via {d.method.toLowerCase().replace("_", " ")}
                      </span>
                      {d.deliveredBy && <> by {d.deliveredBy.name}</>} · {timeAgoShort(d.deliveredAt)}
                      {d.url && (
                        <> — <a href={d.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">{d.url}</a></>
                      )}
                      {d.file && (
                        <> — <a href={d.file.url ?? "#"} target="_blank" rel="noreferrer" className="underline underline-offset-2">{d.file.name}</a></>
                      )}
                      {d.note && <p className="text-emerald-700 mt-0.5">{d.note}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                {canPlan ? (
                  <textarea value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }}
                    rows={4} placeholder="Add a description, requirements, or notes…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                ) : (
                  <p className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-wrap min-h-[3rem]">
                    {description || <span className="text-gray-400">No description.</span>}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/*
                  The person doing the work moves it with Start task and Mark
                  finished, above — a status list would just be a second way to
                  do the same thing, and the one that skips asking for proof.
                  A planner keeps the list: they need to park something as
                  Blocked or pull it back without pretending to be the assignee.
                */}
                {canPlan ? (
                  <SelectField
                    label="Status"
                    value={status}
                    onChange={(v) => { const st = v as TaskStatus; setStatus(st); handleStatusChange(st); }}
                    options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                ) : (
                  <ReadOnlyField label="Status" value={STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status} />
                )}
                {canPlan ? (
                  <SelectField label="Priority" value={priority} onChange={(v) => { setPriority(v as Priority); markDirty(); }} options={PRIORITY_OPTIONS} />
                ) : (
                  <ReadOnlyField label="Priority" value={PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority} />
                )}
              </div>

              <div>
                {canPlan ? (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Deadline</label>
                    <input type="datetime-local" value={dueDate} onChange={(e) => { setDueDate(e.target.value); markDirty(); }}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </>
                ) : (
                  <ReadOnlyField label="Deadline" value={dueDate ? formatDeadline(dueDate) : "No deadline"} />
                )}
              </div>

              <div>
                {canPlan ? (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Estimated Hours</label>
                    <input type="number" step="0.5" min="0" value={estimated}
                      onChange={(e) => { setEstimated(e.target.value); markDirty(); }}
                      placeholder="e.g. 4"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </>
                ) : (
                  <ReadOnlyField label="Estimated Hours" value={estimated ? `${estimated}h` : "Not estimated"} />
                )}
              </div>

              {canPlan ? (
                <div className="grid grid-cols-1 gap-3">
                  <AssigneePicker users={users} assigneeIds={assigneeIds} managerId={managerId}
                    onChangeAssignees={(ids) => { setAssigneeIds(ids); markDirty(); }}
                    onChangeManager={(id) => { setManagerId(id); markDirty(); }} />
                </div>
              ) : (
                <ReadOnlyField
                  label="Assigned to"
                  value={assigneeIds.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean).join(", ") || "Nobody yet"}
                />
              )}

              {/* Client visibility — planners only; the pill above shows the
                  current state to everyone else. */}
              {canPlan && (
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
              )}

              {task.parentId && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Subtask of: {allTasks.find((t) => t.id === task.parentId)?.title ?? "Parent task"}
                </div>
              )}
            </div>
          )}

          {tab === "files" && <TaskFiles taskId={task.id} projectId={projectId} />}

          {tab === "comments" && (
            <div className="space-y-5">
              {/* Who is in this conversation. A junior shouldn't have to guess
                  whether the SMM who briefed the work can see what they wrote
                  here — everyone on the task is in the thread, and is notified
                  when someone posts. */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  In this thread
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {participants.length === 0 ? (
                    <p className="text-xs text-gray-400">Nobody is on this task yet.</p>
                  ) : participants.map((p) => (
                    <span key={`${p.id}-${p.role}`}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-gray-50 border border-gray-200">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center">
                        {p.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-700">{p.name}</span>
                      <span className="text-[10px] text-gray-400">{p.role}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* The round trail sits above the conversation: it's what the
                  submit/review loop produced, and it's the context anyone
                  reading the thread needs first. */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Rounds
                </p>
                <RoundHistory taskId={task.id} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Conversation
                </p>
                <CommentThread taskId={task.id} />
              </div>
            </div>
          )}

          {/* v2: status history */}
          {tab === "history" && (
            history === null ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No status changes recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5 text-xs border border-gray-100 rounded-lg px-3 py-2">
                    <Activity className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-700">
                        <span className="font-medium">{h.changedBy?.name ?? "System"}</span>
                        {h.fromStatus ? (
                          <> moved <span className="font-mono text-[10px] bg-gray-100 px-1 rounded">{h.fromStatus}</span> → <span className="font-mono text-[10px] bg-gray-100 px-1 rounded">{h.toStatus}</span></>
                        ) : (
                          <> — <span className="font-mono text-[10px] bg-gray-100 px-1 rounded">{h.toStatus}</span></>
                        )}
                      </p>
                      {h.note && <p className="text-gray-400 mt-0.5">{h.note}</p>}
                      <p className="text-gray-300 mt-0.5">{timeAgoShort(h.changedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 px-5 py-4 flex items-center justify-between">
          {canPlan && (
            <button onClick={handleDelete} disabled={deleting}
              className={`flex items-center gap-1.5 text-xs transition-colors ${confirmDelete ? "text-red-600 font-semibold" : "text-gray-400 hover:text-red-500"}`}>
              <Trash2 className="w-3.5 h-3.5" />
              {confirmDelete ? "Confirm delete?" : "Delete task"}
            </button>
          )}
          {confirmDelete && canPlan && (
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

      {/* Handing work in: proof, then the reviewer's queue. */}
      {showSubmit && (
        <SubmitWorkDialog
          taskId={task.id}
          taskTitle={task.title}
          onClose={() => setShowSubmit(false)}
          onSubmitted={() => {
            setShowSubmit(false);
            setStatus("IN_REVIEW");
            onUpdated({ ...task, status: "IN_REVIEW" });
          }}
        />
      )}

      {/* v2: delivery-proof dialog when completing */}
      {showDelivery && (
        <DeliveryDialog
          taskId={task.id}
          taskTitle={task.title}
          onClose={() => setShowDelivery(false)}
          onCompleted={handleDelivered}
        />
      )}
    </>
  );
}
