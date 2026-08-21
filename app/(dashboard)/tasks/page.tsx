"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Star, CheckCircle2, Circle, ChevronDown, ChevronRight, ChevronUp,
  MoreVertical, ListTodo, Clock, ShieldCheck, X, FolderKanban, Repeat,
  Link2 as LinkIcon, Paperclip,
} from "lucide-react";
import { TaskModal } from "@/components/tasks/TaskModal";
import { DeliveryDialog } from "@/components/tasks/DeliveryDialog";
import { CalendarTasksSwitch } from "@/components/calendar/CalendarTasksSwitch";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { StatusDot } from "@/components/tasks/TaskList";
import { SubmitWorkDialog, RequestChangesDialog, MarkPostedDialog } from "@/components/tasks/ReviewDialogs";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import { toast } from "@/lib/toast";
import type { Task, TaskStatus } from "@/types";
import { Select } from "@/components/ui/Select";

// ── Types ────────────────────────────────────────────────────

interface PersonalRow {
  id: string;
  title: string;
  note: string | null;
  date: string;
  time: string | null;
  listId: string | null;
  starred: boolean;
  done: boolean;
  createdBy?: { id: string; name: string } | null;
}

interface ListRow { id: string; name: string }

type SidebarView = "all" | "starred";

// ── Helpers ──────────────────────────────────────────────────

function dueChip(dateIso: string): { label: string; late: boolean } {
  const d = new Date(dateIso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return { label: "Today", late: false };
  if (diffDays === 1) return { label: "Tomorrow", late: false };
  if (diffDays === -1) return { label: "Yesterday", late: true };
  if (diffDays < -1) {
    const weeks = Math.floor(-diffDays / 7);
    return { label: weeks >= 1 ? `${weeks} week${weeks !== 1 ? "s" : ""} ago` : `${-diffDays} days ago`, late: true };
  }
  return { label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), late: false };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

// ── Inline "Add a task" composer (Google-Tasks style) ────────

function AddTaskComposer({ listId, onAdded }: { listId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setDetails(""); setShowDetails(false); setDate(null); setOpen(false); };

  const save = async () => {
    if (!title.trim()) { reset(); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/personal-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, note: details || null, date: date ?? todayStr(), listId }),
      });
      if (!res.ok) { toast.error("Couldn't add the task"); return; }
      reset();
      onAdded();
      broadcastChange("all"); // dated to-dos appear on My Calendar too
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
        <Plus className="w-4 h-4" /> Add a task
      </button>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-xl px-3 py-2.5 bg-white shadow-sm">
      <div className="flex items-start gap-2.5">
        <Circle className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <input
            autoFocus value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") reset(); }}
            placeholder="Title"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {showDetails ? (
            <textarea
              value={details} rows={2}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details"
              className="w-full mt-1.5 text-xs text-gray-600 placeholder:text-gray-400 outline-none bg-transparent resize-none"
            />
          ) : (
            <button onClick={() => setShowDetails(true)}
              className="flex items-center gap-1.5 mt-1 text-xs text-gray-400 hover:text-gray-600">
              <ListTodo className="w-3 h-3" /> Details
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <button onClick={() => setDate(date === todayStr() ? null : todayStr())}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                date === todayStr() ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              Today
            </button>
            <button onClick={() => setDate(date === tomorrowStr() ? null : tomorrowStr())}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                date === tomorrowStr() ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              Tomorrow
            </button>
            <label className={`px-1.5 py-1 rounded-full border cursor-pointer transition-colors ${
              date && date !== todayStr() && date !== tomorrowStr() ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`} title="Pick a date">
              <Clock className="w-3 h-3" />
              <input type="date" className="sr-only" value={date ?? ""} onChange={(e) => setDate(e.target.value || null)} />
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={reset} className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
              <button onClick={save} disabled={saving || !title.trim()}
                className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-full hover:bg-indigo-500 disabled:opacity-40">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A task in the review queue, with the proof attached. */
interface SubmittedTask extends Task {
  revision?: number;
  contentItem?: { id: string; topic: string; date: string; creativeType: { name: string; icon: string | null } } | null;
  deliveries?: {
    id: string; method: string; url: string | null; note: string | null;
    file: { id: string; name: string; url: string } | null;
    deliveredBy: { id: string; name: string } | null;
  }[];
}

/** How the work got there, in words a person would use. */
const DELIVERY_LABEL: Record<string, string> = {
  LINK: "a link",
  FILE_UPLOAD: "an upload",
  WHATSAPP: "WhatsApp",
  SLACK: "Slack",
  OTHER: "another route",
};

// ── Page ─────────────────────────────────────────────────────

function TasksBoardInner() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  // Only planners set a status directly — same rule as the project board.
  const canPickStatus = can(currentUser, "content.plan");
  const searchParams = useSearchParams();

  const [items, setItems] = useState<PersonalRow[]>([]);
  const [orgTasks, setOrgTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<SidebarView>("all");
  const [hiddenLists, setHiddenLists] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState<Set<string>>(new Set());
  // v3: the shared task drawer, opened from a row or from ?task=<id>
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<{ id: string; title: string } | null>(null);
  const [showOrgTaskModal, setShowOrgTaskModal] = useState(false);
  // v3: the inbox has two queues — work waiting on review (the main one),
  // and assignment approvals, which only exist while the Head-of-Design gate
  // is switched on.
  const [approvals, setApprovals] = useState<{ submitted: SubmittedTask[]; assignments: Task[] } | null>(null);
  const [reviewFor, setReviewFor] = useState<SubmittedTask | null>(null);
  const [submitFor, setSubmitFor] = useState<Task | null>(null);
  const [postFor, setPostFor] = useState<Task | null>(null);
  const [showApprovals, setShowApprovals] = useState(false);
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);

  // v3: the Approvals inbox belongs to anyone who reviews work, which is a
  // capability rather than a job title (docs/V3_CONTEXT.md §2).
  const isHead = can(currentUser, "tasks.review");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, tasksRes] = await Promise.all([
        fetch("/api/personal-items"),
        fetch("/api/tasks?includeCompleted=true&all=1"),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (tasksRes.ok) {
        const all = await tasksRes.json();
        setOrgTasks(
          (Array.isArray(all) ? all : []).filter((t: Task) =>
            t.assignees?.some((a) => a.userId === currentUser?.id || a.user?.id === currentUser?.id)),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { if (currentUser) fetchAll(); }, [currentUser, fetchAll]);
  // Live: pick up calendar-side edits (and teammates' changes) instantly
  useLiveRefresh(["tasks", "calendar"], () => { if (currentUser) fetchAll(); });

  /**
   * Honour a deep-link exactly once.
   *
   * This effect depends on orgTasks, and useLiveRefresh refetches every 25
   * seconds — which hands it a brand-new array each time and re-runs it. With
   * ?tab=approvals still sitting in the URL, the Approvals panel reopened on
   * every poll, so closing it bought you 25 seconds. Same for ?task=<id>
   * reopening a drawer you'd just dismissed.
   *
   * The param is consumed once and then stripped from the URL, so a reload or
   * a back-navigation doesn't re-trigger it either.
   */
  const consumedDeepLink = useRef(false);
  useEffect(() => {
    if (consumedDeepLink.current) return;

    const tab = searchParams.get("tab");
    const wanted = searchParams.get("task");
    if (!tab && !wanted) return;

    // A task link can't resolve until the list has loaded; wait rather than
    // burning the one shot on an empty array.
    if (wanted && orgTasks.length === 0) return;

    if (tab === "approvals" && isHead) { router.replace("/approvals"); return; }
    if (wanted) {
      const t = orgTasks.find((x) => x.id === wanted);
      if (t) setOpenTask(t);
    }

    consumedDeepLink.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.delete("task");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [searchParams, isHead, orgTasks]);

  const fetchApprovals = useCallback(async () => {
    if (!isHead) return;
    const res = await fetch("/api/tasks/approvals");
    setApprovals(res.ok ? await res.json() : { submitted: [], assignments: [] });
    if (!teamUsers.length) {
      const u = await fetch("/api/users");
      if (u.ok) setTeamUsers(await u.json());
    }
  }, [isHead, teamUsers.length]);

  useEffect(() => { if (showApprovals) fetchApprovals(); }, [showApprovals, fetchApprovals]);

  // ── Actions ────────────────────────────────────────────────

  /**
   * A planner moving assigned work from the list.
   *
   * DONE still routes through the dialog that asks for proof — completing a
   * task without evidence is the thing the review loop exists to prevent, and
   * that holds whether you got here from the board or from this page.
   */
  const handleOrgStatus = async (t: Task, next: TaskStatus) => {
    if (next === t.status) return;
    if (next === "DONE") {
      if (t.kind === "CONTENT_WORK") { setSubmitFor(t); return; }
      if (t.kind === "POST") { setPostFor(t); return; }
      setDeliveryFor({ id: t.id, title: t.title });
      return;
    }
    setOrgTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setOrgTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      const d = await res.json().catch(() => null);
      toast.error(d?.error?.message ?? "Couldn't update that task");
      return;
    }
    broadcastChange("all");
  };

  /**
   * Where a task row leads. Most open the drawer; a planning task opens the
   * project's Plan tab, because that IS the task.
   */
  const openTaskOrPlan = (t: Task) => {
    if (t.kind === "PLANNING" && t.projectId) {
      router.push(`/projects/${t.projectId}?tab=plan`);
      return;
    }
    setOpenTask(t);
  };

  const togglePersonal = async (p: PersonalRow) => {
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, done: !p.done } : x)));
    await fetch(`/api/personal-items/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !p.done }),
    });
    broadcastChange("all"); // the same item sits on My Calendar
  };

  const toggleStar = async (p: PersonalRow) => {
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, starred: !p.starred } : x)));
    await fetch(`/api/personal-items/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !p.starred }),
    });
  };

  const removePersonal = async (p: PersonalRow) => {
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    await fetch(`/api/personal-items/${p.id}`, { method: "DELETE" });
    broadcastChange("all");
  };

  /**
   * v3: lists are AUTOMATIC. One per project the user holds an open task in,
   * named after the project, appearing and disappearing on their own — nobody
   * creates, renames or deletes a list (docs/V3_CONTEXT.md §3).
   */
  const autoLists = useMemo(() => {
    const byProject = new Map<string, { id: string; name: string; tasks: Task[] }>();
    for (const t of orgTasks) {
      if (!t.projectId) continue;
      const name = t.project?.name ?? "Project";
      if (!byProject.has(t.projectId)) {
        byProject.set(t.projectId, { id: t.projectId, name, tasks: [] });
      }
      byProject.get(t.projectId)!.tasks.push(t);
    }
    // A list with nothing open in it has served its purpose and goes away.
    return [...byProject.values()]
      .filter((l) => l.tasks.some((t) => t.status !== "DONE"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orgTasks]);

  /** Tasks with no project — they belong beside the personal reminders. */
  const looseTasks = useMemo(
    () => orgTasks.filter((t) => !t.projectId),
    [orgTasks],
  );

  /**
   * v3: the approver's verdict. Approving creates the posting task, which is
   * why the toast says where it went — otherwise it looks like nothing
   * happened.
   */
  const review = async (taskId: string, decision: "APPROVED" | "CHANGES_REQUESTED", comments?: string) => {
    const res = await fetch(`/api/tasks/${taskId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comments }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error?.message ?? "Review failed"); return; }
    if (decision === "APPROVED") {
      toast.success(data.postTaskId ? "Approved — a posting task is now on your list" : "Approved");
    } else {
      toast.success(`Sent back — now round ${data.revision}`);
    }
    setReviewFor(null);
    fetchApprovals();
    fetchAll();
    broadcastChange("all");
  };

  const approve = async (taskId: string, assigneeId?: string) => {
    const res = await fetch(`/api/tasks/${taskId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assigneeId ? { assigneeId } : {}),
    });
    if (res.ok) { toast.success(assigneeId ? "Reassigned" : "Approved"); setReassignFor(null); setReassignTo(""); fetchApprovals(); fetchAll(); }
    else toast.error("Approval failed");
  };

  // ── Row renderers ──────────────────────────────────────────

  const renderOrgTaskRow = (t: Task) => {
    const chip = t.dueDate ? dueChip(t.dueDate) : null;
    const done = t.status === "DONE";
    return (
      <div key={`org-${t.id}`} className="group flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors">
        {/*
          The same control as the project board, deliberately. This used to be
          a tick that jumped a task straight to complete, so the same dot meant
          "finish this" here and "change status" there. Assigned work moves the
          one way it moves everywhere: a planner picks a status, everyone else
          opens the task and presses Start / Mark completed.

          Personal items keep the tick — see renderPersonalRow. Ticking your own
          reminder off IS the whole interaction there, and that one is right.
        */}
        <div className="mt-1 flex-shrink-0">
          <StatusDot
            status={t.status}
            canPick={canPickStatus}
            onPick={(next) => handleOrgStatus(t, next)}
          />
        </div>
        <div className="flex-1 min-w-0">
          {/*
            "Plan this project" opens the plan, not a form about the plan.
            A PLANNING task has no brief to read and nothing to type into it —
            the work is entirely on the project's Plan tab, and the task closes
            itself once the quota is filled. Sending it to a task drawer made
            the SMM press Start, read a description the system wrote, then go
            find the plan anyway.
          */}
          <button onClick={() => openTaskOrPlan(t)}
            className={`block w-full text-left text-sm leading-snug ${done ? "line-through text-gray-400" : "text-gray-800 hover:text-indigo-700"}`}>
            {t.title}
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* v3: a round badge from round 2 — the work came back once */}
            {(t.revision ?? 1) > 1 && (
              <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                Round {t.revision}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
              <FolderKanban className="w-2.5 h-2.5" />
              {(t as Task & { project?: { name?: string } }).project?.name ?? t.client?.name ?? "Assigned to you"}
            </span>
            {/* A planning task measures itself: how much of the cycle is planned. */}
            {t.kind === "PLANNING" && typeof t.progress === "number" && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                t.progress >= 100
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-violet-50 text-violet-700 border-violet-200"
              }`}>
                {t.progress}% planned
              </span>
            )}
            {chip && !done && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                chip.late ? "bg-red-50 border-red-200 text-red-600" : "bg-gray-50 border-gray-200 text-gray-600"
              }`}>
                <Clock className="w-2.5 h-2.5" /> {chip.label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPersonalRow = (p: PersonalRow) => {
    const chip = dueChip(p.date);
    return (
      <div key={p.id} className="group flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors">
        <button className="mt-0.5 flex-shrink-0" onClick={() => togglePersonal(p)}>
          {p.done ? <CheckCircle2 className="w-4.5 h-4.5 text-indigo-500" /> : <Circle className="w-4.5 h-4.5 text-gray-300 hover:text-indigo-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${p.done ? "line-through text-gray-400" : "text-gray-800"}`}>{p.title}</p>
          {p.note && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.note}</p>}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {!p.done && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                chip.late ? "bg-red-50 border-red-200 text-red-600" : "bg-gray-50 border-gray-200 text-gray-600"
              }`}>
                <Clock className="w-2.5 h-2.5" /> {chip.label}{p.time ? ` · ${p.time}` : ""}
              </span>
            )}
            {p.createdBy && p.createdBy.id !== currentUser?.id && (
              <span className="text-[10px] text-gray-400">from {p.createdBy.name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => toggleStar(p)} title={p.starred ? "Unstar" : "Star"}>
            <Star className={`w-3.5 h-3.5 ${p.starred ? "text-amber-400 fill-amber-400 opacity-100" : "text-gray-300 hover:text-amber-400"}`} />
          </button>
          <button onClick={() => removePersonal(p)} title="Delete" className="text-gray-300 hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {p.starred && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5 group-hover:hidden" />}
      </div>
    );
  };

  // ── Column ─────────────────────────────────────────────────

  /**
   * One column. `kind` decides what it is:
   *   "personal" — My List, the only place anyone freely creates items
   *   "project"  — an auto list, read-only in structure
   */
  const Column = ({ id, title, subtitle, kind, personal, org }: {
    id: string; title: string; subtitle?: string;
    kind: "personal" | "project";
    personal: PersonalRow[]; org?: Task[];
  }) => {
    const openPersonal = personal.filter((p) => !p.done);
    const donePersonal = personal.filter((p) => p.done);
    const openOrg = (org ?? []).filter((t) => t.status !== "DONE");
    const doneOrg = (org ?? []).filter((t) => t.status === "DONE");
    const completedCount = donePersonal.length + doneOrg.length;
    const expanded = showCompleted.has(id);
    // Overdue is the number worth shouting about.
    const overdue = openOrg.filter(
      (t) => t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString()),
    ).length;

    return (
      <div className="w-[320px] flex-shrink-0 bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm">
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900 truncate">{title}</h2>
            <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
              {openOrg.length + openPersonal.length}
              {overdue > 0 && (
                <span className="text-red-500 font-semibold ml-1.5">{overdue} overdue</span>
              )}
            </span>
          </div>
          {subtitle && <p className="text-[11px] text-gray-400 truncate mt-0.5">{subtitle}</p>}
        </div>

        {/* v3: My List is the ONLY list anyone can add to freely. */}
        {kind === "personal" && (
          <div className="px-2 pb-1">
            <AddTaskComposer listId={null} onAdded={fetchAll} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[120px]">
          {loading ? (
            <div className="space-y-2 px-2 pt-1">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : openOrg.length + openPersonal.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-200 mb-2" />
              <p className="text-sm font-medium text-gray-600">Nothing open</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {kind === "personal"
                  ? "Your own reminders live here."
                  : "Work assigned to you on this project lands here."}
              </p>
            </div>
          ) : (
            <>
              {openOrg.map(renderOrgTaskRow)}
              {openPersonal.map(renderPersonalRow)}
            </>
          )}

          {completedCount > 0 && (
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                onClick={() => setShowCompleted((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; })}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 rounded-xl">
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Completed ({completedCount})
              </button>
              {expanded && (
                <div className="opacity-70">
                  {doneOrg.map(renderOrgTaskRow)}
                  {donePersonal.map(renderPersonalRow)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Data slices ────────────────────────────────────────────

  const noListItems = useMemo(() => items.filter((p) => !p.listId), [items]);
  const itemsByList = useMemo(() => {
    const m = new Map<string, PersonalRow[]>();
    for (const p of items) if (p.listId) m.set(p.listId, [...(m.get(p.listId) ?? []), p]);
    return m;
  }, [items]);
  const starredItems = useMemo(() => items.filter((p) => p.starred), [items]);
  // What My List actually holds: personal reminders plus any task with no
  // project (project work lives in its own automatic list).
  const myListCount = looseTasks.filter((t) => t.status !== "DONE").length
    + noListItems.filter((p) => !p.done).length;
  const openCount = orgTasks.filter((t) => t.status !== "DONE").length
    + noListItems.filter((p) => !p.done).length;
  const overdueCount = orgTasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString()),
  ).length;

  return (
    // Anchor to the viewport so the rail and columns fill the page
    // (the dashboard shell is min-h-screen, so h-full alone can't resolve).
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-dvh min-h-0">
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {openCount} open
              {overdueCount > 0 && (
                <span className="text-red-600 font-medium"> · {overdueCount} overdue</span>
              )}
              {" · "}work assigned to you lands here and on your calendar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarTasksSwitch active="tasks" />
            {/* Approvals is its own page now — a review needs the brief and
                the submission side by side, which a drawer never had room for. */}
            {isHead && (
              <Link href="/approvals"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors">
                <ShieldCheck className="w-3.5 h-3.5" /> Approvals
                {approvals && approvals.submitted.length + approvals.assignments.length > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-amber-500 rounded-full">
                    {approvals.submitted.length + approvals.assignments.length}
                  </span>
                )}
              </Link>
            )}
            {/*
              Everyone gets this, because everyone has someone to give a task
              to — an editor has themselves. The picker inside is filtered to
              whoever the person may actually assign, so the button says the
              same thing to all of them and the scope does the talking.
            */}
            <button onClick={() => setShowOrgTaskModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
              <Plus className="w-4 h-4" /> New task
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── In-page rail ── */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white hidden md:flex flex-col overflow-y-auto">
          <div className="p-3 space-y-0.5">
            <button onClick={() => setView("all")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === "all" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              }`}>
              <ListTodo className="w-4 h-4" /> All tasks
            </button>
            <button onClick={() => setView("starred")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === "starred" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              }`}>
              <Star className="w-4 h-4" /> Starred
              {starredItems.length > 0 && <span className="ml-auto text-xs text-gray-400">{starredItems.length}</span>}
            </button>
          </div>

          <div className="border-t border-gray-100 mx-3" />

          <div className="p-3 space-y-0.5 flex-1">
            <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Lists</p>

            <label className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-default">
              <input type="checkbox" checked readOnly className="rounded border-gray-300 text-indigo-600" />
              <span className="flex-1 truncate font-medium">My List</span>
              <span className="text-xs text-gray-400">{myListCount}</span>
            </label>
            {autoLists.map((l) => {
              const count = l.tasks.filter((t) => t.status !== "DONE").length;
              return (
                <label key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
                  <input type="checkbox"
                    checked={!hiddenLists.has(l.id)}
                    onChange={() => setHiddenLists((s) => { const x = new Set(s); if (x.has(l.id)) x.delete(l.id); else x.add(l.id); return x; })}
                    className="rounded border-gray-300 text-indigo-600" />
                  <span className="flex-1 truncate">{l.name}</span>
                  {count > 0 && <span className="text-xs text-gray-400">{count}</span>}
                </label>
              );
            })}

            {/* v3: lists appear and disappear on their own — one per project
                you hold work in. Nothing here creates or deletes one. */}
            <p className="px-3 pt-2 text-[11px] text-gray-400 leading-snug">
              Project lists appear here automatically while you have open work on them.
            </p>
          </div>
        </div>

        {/* ── Board ── */}
        <div className="flex-1 min-w-0 bg-gray-50 overflow-x-auto">
          <div className="h-full flex items-stretch gap-4 p-4 sm:p-6">
            {view === "starred" ? (
              <div className="w-[340px] flex-shrink-0 bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm">
                <div className="px-4 pt-4 pb-2 flex-shrink-0">
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> Starred
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
                  {starredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                      <Star className="w-9 h-9 text-amber-200 mb-2" />
                      <p className="text-sm font-medium text-gray-600">Nothing starred</p>
                      <p className="text-xs text-gray-400 mt-0.5">Hover a task and tap the star to pin it here.</p>
                    </div>
                  ) : starredItems.map(renderPersonalRow)}
                </div>
              </div>
            ) : (
              <>
                {/* My List — personal reminders plus any task with no project */}
                <Column id="my-list" title="My List" kind="personal"
                  subtitle="Your own reminders"
                  personal={noListItems} org={looseTasks} />
                {/* One per project you hold work in, named after the project */}
                {autoLists.filter((l) => !hiddenLists.has(l.id)).map((l) => (
                  <Column key={l.id} id={l.id} title={l.name} kind="project"
                    subtitle={l.tasks[0]?.client?.name ?? undefined}
                    personal={[]} org={l.tasks} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* v3: ONE task drawer, the same component the project page uses */}
      {openTask && (
        <TaskPanel
          task={openTask}
          allTasks={orgTasks}
          projectId={openTask.projectId ?? undefined}
          onClose={() => setOpenTask(null)}
          onUpdated={() => { fetchAll(); broadcastChange("all"); }}
          onDeleted={() => { setOpenTask(null); fetchAll(); broadcastChange("all"); }}
        />
      )}

      {/* ── Approvals slide-over (heads only) ── */}
      {showApprovals && isHead && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowApprovals(false)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" /> Approvals
              </h2>
              <button onClick={() => setShowApprovals(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {approvals === null ? (
                <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
              ) : approvals.submitted.length + approvals.assignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Nothing waiting on you.</p>
              ) : (
                <>
                  {/* Work submitted for review — the main queue */}
                  {approvals.submitted.map((t) => {
                    const proof = t.deliveries?.[0];
                    const who = t.assignees?.[0]?.user?.name;
                    return (
                      <div key={t.id} className="border border-indigo-200 rounded-xl p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {t.contentItem?.creativeType?.icon && <span className="mr-1">{t.contentItem.creativeType.icon}</span>}
                              {t.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {t.client?.name ?? "General"}
                              {t.project && <> · {t.project.name}</>}
                            </p>
                          </div>
                          {(t.revision ?? 1) > 1 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full flex-shrink-0">
                              Round {t.revision}
                            </span>
                          )}
                        </div>

                        {/* The proof, right here — judging it shouldn't need a detour */}
                        {proof && (
                          <div className="mt-2.5 p-2.5 bg-gray-50 rounded-lg text-xs space-y-1">
                            <p className="text-gray-500">
                              <span className="font-medium text-gray-700">{who ?? "Someone"}</span>
                              {" submitted via "}
                              {DELIVERY_LABEL[proof.method] ?? proof.method.toLowerCase()}
                            </p>
                            {proof.note && <p className="text-gray-700 italic">{proof.note}</p>}
                            {proof.url && (
                              <a href={proof.url} target="_blank" rel="noreferrer"
                                className="text-indigo-600 hover:underline break-all inline-flex items-center gap-1">
                                <LinkIcon className="w-3 h-3 flex-shrink-0" /> {proof.url}
                              </a>
                            )}
                            {proof.file && (
                              <a href={proof.file.url} target="_blank" rel="noreferrer"
                                className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                                <Paperclip className="w-3 h-3" /> {proof.file.name}
                              </a>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-2.5">
                          <button onClick={() => review(t.id, "APPROVED")}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500">
                            Approve
                          </button>
                          <button onClick={() => setReviewFor(t)}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                            Request changes
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Assignment approvals — only while the gate is on */}
                  {approvals.assignments.length > 0 && (
                    <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Assignment approvals
                    </p>
                  )}
                  {approvals.assignments.map((t) => (
                    <div key={t.id} className="border border-amber-200 rounded-xl p-3.5">
                      <p className="text-sm font-medium text-gray-900">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.client?.name ?? "General"}
                        {t.preferredAssignee && <> · Preferred: <b className="text-gray-600">{t.preferredAssignee.name}</b></>}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {reassignFor === t.id ? (
                          <>
                            <Select
                              value={reassignTo}
                              onChange={(v) => setReassignTo(v)}
                              options={[{ value: "", label: "Pick person…" }, ...teamUsers.map((u) => ({ value: u.id, label: `${u.name}` }))]}
                              size="sm"
                            />
                            <button onClick={() => reassignTo && approve(t.id, reassignTo)} disabled={!reassignTo}
                              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg disabled:opacity-50">Assign</button>
                            <button onClick={() => setReassignFor(null)} className="text-xs text-gray-400">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => approve(t.id)} disabled={!t.preferredAssignee}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg disabled:opacity-50">
                              Approve{t.preferredAssignee ? ` → ${t.preferredAssignee.name}` : ""}
                            </button>
                            <button onClick={() => setReassignFor(t.id)}
                              className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                              Someone else
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* v3: handing work in, with proof */}
      {submitFor && (
        <SubmitWorkDialog
          taskId={submitFor.id}
          taskTitle={submitFor.title}
          revision={submitFor.revision}
          onClose={() => setSubmitFor(null)}
          onSubmitted={() => {
            setSubmitFor(null);
            toast.success("Submitted for approval");
            fetchAll();
            broadcastChange("all");
          }}
        />
      )}

      {/* v3: the posting task closing — the content is live */}
      {postFor && (
        <MarkPostedDialog
          taskId={postFor.id}
          taskTitle={postFor.title}
          onClose={() => setPostFor(null)}
          onPosted={() => {
            setPostFor(null);
            toast.success("Posted");
            fetchAll();
            broadcastChange("all");
          }}
        />
      )}

      {/* v3: asking for changes needs a reason — that's the whole point */}
      {reviewFor && (
        <RequestChangesDialog
          taskTitle={reviewFor.title}
          onCancel={() => setReviewFor(null)}
          onSubmit={(comments) => review(reviewFor.id, "CHANGES_REQUESTED", comments)}
        />
      )}

      {/* Delegate an org task (full task modal with routing) */}
      {showOrgTaskModal && (
        <TaskModal
          global
          onClose={() => setShowOrgTaskModal(false)}
          onSaved={() => { setShowOrgTaskModal(false); fetchAll(); toast.success("Task created"); }}
        />
      )}

      {/* Delivery proof when completing a delegated task */}
      {deliveryFor && (
        <DeliveryDialog
          taskId={deliveryFor.id}
          taskTitle={deliveryFor.title}
          onClose={() => setDeliveryFor(null)}
          onCompleted={() => { setDeliveryFor(null); fetchAll(); broadcastChange("all"); }}
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="w-[320px] h-72 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    }>
      <TasksBoardInner />
    </Suspense>
  );
}
