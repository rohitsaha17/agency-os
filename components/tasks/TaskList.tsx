"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight, Plus, Calendar, AlertCircle, Timer,
  GripVertical, UserPlus, Eye, GitBranch, Check,
} from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import type { Task, TaskStatus } from "@/types";

// ── Status visuals ────────────────────────────────────────────

const STATUS_DOT: Record<TaskStatus, { dot: string; label: string; ring: string }> = {
  TODO:        { dot: "bg-gray-300",    label: "To Do",       ring: "ring-gray-200" },
  IN_PROGRESS: { dot: "bg-blue-500",    label: "In Progress", ring: "ring-blue-200" },
  IN_REVIEW:   { dot: "bg-amber-400",   label: "In Review",   ring: "ring-amber-200" },
  DONE:        { dot: "bg-emerald-500", label: "Done",        ring: "ring-emerald-200" },
  BLOCKED:     { dot: "bg-red-500",     label: "Blocked",     ring: "ring-red-200" },
};

const STATUS_ROW_LEFT: Record<TaskStatus, string> = {
  TODO:        "border-l-gray-200",
  IN_PROGRESS: "border-l-blue-400",
  IN_REVIEW:   "border-l-amber-400",
  DONE:        "border-l-emerald-400",
  BLOCKED:     "border-l-red-400",
};

const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"];

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

/** A deadline in the list, with the clock only when one was set. */
function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  return {
    label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      + (hasClock(date) ? `, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""),
    isOverdue: date < new Date(),
  };
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/**
 * The status control.
 *
 * This used to advance blindly to the next status in a fixed cycle: one click
 * moved To Do → In Progress with nothing on screen naming where it landed, and
 * five clicks wrapped you back to where you started. You had to know the cycle
 * by heart to use it.
 *
 * Now it opens a list, so the status you're choosing is written down before
 * you pick it. The row's left border recolours from the same map the moment
 * the choice is made.
 */
function StatusDot({ status, onPick }: { status: TaskStatus; onPick: (s: TaskStatus) => void }) {
  const { dot, label, ring } = STATUS_DOT[status];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * The menu is rendered into document.body, not next to the dot.
   *
   * The task list sits in a rounded card with overflow-hidden, which clipped
   * an absolutely-positioned menu down to a sliver — you could see the word
   * "Move to" and nothing else. Fixed position off the trigger's rect escapes
   * every clipping ancestor, so it doesn't matter what it's nested in.
   */
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const height = STATUS_ORDER.length * 30 + 34;
    const flip = r.bottom + height > window.innerHeight && r.top > height;
    setPos({
      top: flip ? r.top - height - 6 : r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - 190),
    });
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const reposition = () => setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); if (!open) place(); setOpen((v) => !v); }}
        title={`${label} — click to change status`}
        aria-label={`Status: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ${ring} ${dot} hover:scale-125 transition-transform`}
      />
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
          className="z-[100] w-44 py-1 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 shadow-lg shadow-black/[0.08] dark:shadow-black/40"
        >
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Move to
          </p>
          {STATUS_ORDER.map((st) => (
            <button
              key={st}
              role="menuitem"
              onClick={() => { setOpen(false); if (st !== status) onPick(st); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/70 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[st].dot}`} />
              <span className="flex-1 text-left">{STATUS_DOT[st].label}</span>
              {st === status && <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function AssigneeRow({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const hasAssignees = task.assignees.length > 0;
  const hasManager = !!task.manager;
  return (
    <div
      className="flex items-center gap-0.5 flex-shrink-0 cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onOpen(task); }}
      title={hasAssignees || hasManager ? "Manage team" : "Assign team members"}
    >
      {hasManager && (
        <div title={`Manager: ${task.manager!.name}`} className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold flex items-center justify-center ring-2 ring-purple-300 z-10">
          {initials(task.manager!.name)}
        </div>
      )}
      {task.assignees.slice(0, 3).map((a) => (
        <div key={a.userId} title={a.user.name} className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-semibold flex items-center justify-center ring-1 ring-white -ml-1 first:ml-0">
          {initials(a.user.name)}
        </div>
      ))}
      {task.assignees.length > 3 && (
        <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-semibold flex items-center justify-center ring-1 ring-white -ml-1">
          +{task.assignees.length - 3}
        </div>
      )}
      {!hasAssignees && !hasManager && (
        <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <UserPlus className="w-2.5 h-2.5 text-gray-400" />
        </div>
      )}
    </div>
  );
}

interface DropTarget { id: string; pos: "before" | "after" }

interface TaskRowProps {
  task: Task;
  depth: number;
  onOpen: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  /** Omitted for people who don't plan — the add controls then don't render. */
  onAddSubtask?: (parent: Task) => void;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (taskId: string) => void;
  onDragOver: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function TaskRow({ task, depth, onOpen, onStatusChange, onAddSubtask, draggingId, dropTarget, onDragStart, onDragOver, onDragEnd, onDrop }: TaskRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (task.children?.length ?? 0) > 0;
  const childCount = task.children?.length ?? 0;
  const doneCount = task.children?.filter((c) => c.status === "DONE").length ?? 0;
  const due = formatDate(task.dueDate);
  const isDragging = draggingId === task.id;
  const isDropBefore = dropTarget?.id === task.id && dropTarget.pos === "before";
  const isDropAfter = dropTarget?.id === task.id && dropTarget.pos === "after";
  const canDrag = depth === 0;
  const isDone = task.status === "DONE";

  return (
    <>
      {isDropBefore && <div className="h-0.5 bg-indigo-500 mx-3 rounded-full" />}
      <div
        draggable={canDrag}
        onDragStart={canDrag ? (e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(task.id); } : undefined}
        onDragOver={canDrag ? (e) => onDragOver(e, task.id) : undefined}
        onDragEnd={canDrag ? onDragEnd : undefined}
        onDrop={canDrag ? (e) => { e.preventDefault(); onDrop(); } : undefined}
        onClick={() => onOpen(task)}
        className={`group flex items-center gap-2.5 py-2.5 border-l-2 border-b border-b-gray-100 dark:border-b-slate-800 transition-all cursor-pointer ${STATUS_ROW_LEFT[task.status]} ${isDone ? "opacity-60" : ""} ${isDragging ? "opacity-30 bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-gray-50/80 dark:hover:bg-slate-800/60"}`}
        style={{ paddingLeft: `${12 + depth * 22}px`, paddingRight: "10px" }}
      >
        {/* Drag handle */}
        {canDrag ? (
          <div className="flex-shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        ) : <div className="w-3.5 flex-shrink-0" />}

        {/* Expand / subtask indicator */}
        <div className="w-5 flex-shrink-0 flex items-center justify-center">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
              title={`${childCount} subtask${childCount !== 1 ? "s" : ""}`}
            >
              <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          ) : depth > 0 ? <div className="w-1.5 h-1.5 rounded-full bg-gray-200" /> : null}
        </div>

        {/* Status dot */}
        <StatusDot status={task.status} onPick={(s) => onStatusChange(task.id, s)} />

        {/* Title + subtask progress */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm leading-snug block truncate ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}>
            {task.title}
          </span>
          {hasChildren && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${task.progress >= 75 ? "bg-emerald-400" : task.progress >= 40 ? "bg-indigo-400" : "bg-gray-300"}`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <GitBranch className="w-2.5 h-2.5" />{doneCount}/{childCount}
              </span>
            </div>
          )}
        </div>

        {/* Client visible indicator */}
        {task.isClientVisible && (
          <span title="Visible to client" className="flex-shrink-0">
            <Eye className="w-3 h-3 text-sky-400" />
          </span>
        )}

        {/* Assignees */}
        <div onClick={(e) => e.stopPropagation()}>
          <AssigneeRow task={task} onOpen={onOpen} />
        </div>

        {/* Priority */}
        <div className="flex-shrink-0"><PriorityBadge priority={task.priority} compact /></div>

        {/* Time */}
        {task.estimatedHours ? (
          <span className="text-[11px] text-gray-400 flex-shrink-0 flex items-center gap-0.5 w-14 justify-end tabular-nums">
            <Timer className="w-3 h-3" />
            {task.loggedHours > 0 ? `${task.loggedHours}/` : ""}{task.estimatedHours}h
          </span>
        ) : <span className="w-14 flex-shrink-0" />}

        {/* Due date */}
        {due ? (
          <span className={`text-[11px] flex-shrink-0 flex items-center gap-1 w-[68px] justify-end tabular-nums ${due.isOverdue && !isDone ? "text-red-500" : "text-gray-400"}`}>
            {due.isOverdue && !isDone && <AlertCircle className="w-3 h-3" />}
            <Calendar className="w-3 h-3" />{due.label}
          </span>
        ) : <span className="w-[68px] flex-shrink-0" />}

        {/* Add subtask — planners only */}
        {onAddSubtask && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddSubtask(task); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded flex-shrink-0"
          title="Add subtask"
        >
          <Plus className="w-3.5 h-3.5 text-gray-500" />
        </button>
        )}
      </div>
      {isDropAfter && <div className="h-0.5 bg-indigo-500 mx-3 rounded-full" />}

      {hasChildren && expanded && task.children!.map((child) => (
        <TaskRow key={child.id} task={child} depth={depth + 1} onOpen={onOpen} onStatusChange={onStatusChange} onAddSubtask={onAddSubtask} draggingId={draggingId} dropTarget={dropTarget} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDrop={onDrop} />
      ))}
    </>
  );
}

interface TaskListProps {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAddTask?: () => void;
  /** Omitted for people who don't plan — the add controls then don't render. */
  onAddSubtask?: (parent: Task) => void;
  onReorder?: (taskIds: string[]) => void;
  groupByStatus?: boolean;
}

export function TaskList({ tasks, onOpen, onStatusChange, onAddTask, onAddSubtask, onReorder, groupByStatus = false }: TaskListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const handleDragStart = (id: string) => { setDraggingId(id); setDropTarget(null); };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggingId === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget((prev) => prev?.id === id && prev.pos === pos ? prev : { id, pos });
  };
  const handleDragEnd = () => { setDraggingId(null); setDropTarget(null); };
  const handleDrop = () => {
    if (!draggingId || !dropTarget || draggingId === dropTarget.id || !onReorder) { handleDragEnd(); return; }
    const dragIdx = tasks.findIndex((t) => t.id === draggingId);
    if (dragIdx === -1) { handleDragEnd(); return; }
    const reordered = [...tasks];
    const [removed] = reordered.splice(dragIdx, 1);
    const newIdx = reordered.findIndex((t) => t.id === dropTarget.id);
    if (newIdx === -1) { handleDragEnd(); return; }
    reordered.splice(dropTarget.pos === "after" ? newIdx + 1 : newIdx, 0, removed);
    onReorder(reordered.map((t) => t.id));
    handleDragEnd();
  };

  const rowProps = { onOpen, onStatusChange, onAddSubtask, draggingId, dropTarget, onDragStart: handleDragStart, onDragOver: handleDragOver, onDragEnd: handleDragEnd, onDrop: handleDrop };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <GitBranch className="w-5 h-5 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-600">
          {onAddTask ? "No tasks yet" : "Nothing assigned to you here"}
        </p>
        <p className="text-xs text-gray-400 mt-1 mb-4">
          {onAddTask
            ? "Break this project into tasks to start tracking work"
            : "Work assigned to you on this project will appear here."}
        </p>
        {onAddTask && (
        <button onClick={onAddTask} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add First Task
        </button>
        )}
      </div>
    );
  }

  const STATUS_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
    { status: "IN_PROGRESS", label: "In Progress", color: "bg-blue-500" },
    { status: "IN_REVIEW",   label: "In Review",   color: "bg-amber-400" },
    { status: "BLOCKED",     label: "Blocked",     color: "bg-red-500" },
    { status: "TODO",        label: "To Do",       color: "bg-gray-300" },
    { status: "DONE",        label: "Done",        color: "bg-emerald-500" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        <div className="w-9 flex-shrink-0" />
        <span className="flex-1">Task</span>
        <span className="w-16 text-center">Assignees</span>
        <span className="w-12 text-center">Priority</span>
        <span className="w-14 text-right">Est.</span>
        <span className="w-[68px] text-right">Due</span>
        <span className="w-7 flex-shrink-0" />
      </div>

      {groupByStatus ? (
        STATUS_GROUPS.map((g) => {
          const gt = tasks.filter((t) => t.status === g.status);
          if (!gt.length) return null;
          return (
            <div key={g.status}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/70 border-b border-gray-100">
                <div className={`w-1.5 h-1.5 rounded-full ${g.color}`} />
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{g.label}</span>
                <span className="text-[10px] text-gray-400 bg-gray-200 rounded-full px-1.5 leading-4">{gt.length}</span>
              </div>
              {gt.map((t) => <TaskRow key={t.id} task={t} depth={0} {...rowProps} />)}
            </div>
          );
        })
      ) : (
        tasks.map((t) => <TaskRow key={t.id} task={t} depth={0} {...rowProps} />)
      )}

      {onAddTask && (
        <button onClick={onAddTask} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors border-t border-gray-100">
          <Plus className="w-3.5 h-3.5" /> Add task
        </button>
      )}
    </div>
  );
}
