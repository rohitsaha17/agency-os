"use client";

import { useState } from "react";
import { Calendar, Plus, GitBranch, Timer, GripVertical, UserPlus } from "lucide-react";
import { PriorityBadge } from "./PriorityBadge";
import type { Task, TaskStatus } from "@/types";

const COLUMNS: { status: TaskStatus; label: string; color: string; dot: string; headerBg: string }[] = [
  { status: "TODO",        label: "To Do",       color: "border-gray-200",    dot: "bg-gray-400",    headerBg: "bg-gray-50" },
  { status: "IN_PROGRESS", label: "In Progress", color: "border-blue-200",   dot: "bg-blue-500",    headerBg: "bg-blue-50" },
  { status: "IN_REVIEW",   label: "In Review",   color: "border-yellow-200", dot: "bg-yellow-500",  headerBg: "bg-yellow-50" },
  { status: "BLOCKED",     label: "Blocked",     color: "border-red-200",    dot: "bg-red-500",     headerBg: "bg-red-50" },
  { status: "DONE",        label: "Done",        color: "border-emerald-200",dot: "bg-emerald-500", headerBg: "bg-emerald-50" },
];

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flattenTasks(t.children ?? [])]);
}

function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  return { label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), isOverdue: date < new Date() };
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

interface TaskCardProps {
  task: Task;
  onOpen: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAddSubtask: (parent: Task) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onCardDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function TaskCard({
  task, onOpen, onStatusChange, onAddSubtask,
  isDragging, onDragStart, onCardDragOver, onDragEnd,
}: TaskCardProps) {
  const childCount = task.children?.length ?? 0;
  const hasChildren = childCount > 0;
  const doneCount = task.children?.filter((c) => c.status === "DONE").length ?? 0;
  const due = formatDate(task.dueDate);
  const hasAssignees = task.assignees.length > 0;
  const hasManager = !!task.manager;
  const hasTeam = hasAssignees || hasManager;

  const progressColor =
    task.progress >= 75 ? "bg-emerald-400" :
    task.progress >= 40 ? "bg-indigo-400" :
    "bg-gray-300";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onCardDragOver}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className={`bg-white border rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group select-none ${
        isDragging ? "opacity-30 ring-2 ring-indigo-300" : ""
      }`}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-1.5 mb-2.5">
        <p className={`text-sm font-medium leading-snug line-clamp-2 flex-1 ${
          task.status === "DONE" ? "line-through text-gray-400" : "text-gray-900"
        }`}>
          {task.title}
        </p>
        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Progress bar for parent tasks */}
      {hasChildren && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <GitBranch className="w-2.5 h-2.5" />
              {doneCount}/{childCount} subtasks
            </span>
            <span className="text-[10px] font-semibold text-gray-500">{task.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <PriorityBadge priority={task.priority} />

        {due && (
          <span className={`inline-flex items-center gap-1 text-xs ${due.isOverdue && task.status !== "DONE" ? "text-red-600" : "text-gray-400"}`}>
            <Calendar className="w-3 h-3" />
            {due.label}
          </span>
        )}

        {task.estimatedHours && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Timer className="w-3 h-3" />
            {task.estimatedHours}h
          </span>
        )}
      </div>

      {/* Team row — assignees + manager */}
      <div
        className="flex items-center justify-between mb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onOpen(task)}
          className="flex items-center gap-0.5 group/team"
          title={hasTeam ? "Manage team" : "Assign team members"}
        >
          {/* Manager */}
          {hasManager && (
            <div
              title={`Manager: ${task.manager!.name}`}
              className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold flex items-center justify-center ring-2 ring-purple-300 z-10"
            >
              {initials(task.manager!.name)}
            </div>
          )}
          {/* Assignees */}
          {task.assignees.slice(0, 4).map((a, i) => (
            <div
              key={a.userId}
              title={a.user.name}
              className={`w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-semibold flex items-center justify-center ring-1 ring-white ${i > 0 || hasManager ? "-ml-1.5" : ""}`}
            >
              {initials(a.user.name)}
            </div>
          ))}
          {task.assignees.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[9px] font-semibold flex items-center justify-center ring-1 ring-white -ml-1.5">
              +{task.assignees.length - 4}
            </div>
          )}
          {/* Empty state */}
          {!hasTeam && (
            <div className="flex items-center gap-1 text-xs text-gray-300 group-hover/team:text-indigo-400 transition-colors">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Assign</span>
            </div>
          )}
        </button>

        {/* Add subtask */}
        <button
          onClick={() => onAddSubtask(task)}
          className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-0.5 transition-colors opacity-0 group-hover:opacity-100"
          title="Add subtask"
        >
          <Plus className="w-3 h-3" />
          <span>Subtask</span>
        </button>
      </div>

      {/* Status quick-change row */}
      <div className="flex items-center gap-1 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
        {COLUMNS.filter((c) => c.status !== task.status).slice(0, 3).map((col) => (
          <button
            key={col.status}
            onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, col.status); }}
            className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            → {col.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TaskBoardProps {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAddTask: (status: TaskStatus) => void;
  onAddSubtask: (parent: Task) => void;
  onReorder?: (taskIds: string[]) => void;
}

export function TaskBoard({ tasks, onOpen, onStatusChange, onAddTask, onAddSubtask, onReorder }: TaskBoardProps) {
  const flat = flattenTasks(tasks);

  const [dragInfo, setDragInfo] = useState<{ taskId: string; sourceStatus: TaskStatus } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  const byStatus = (status: TaskStatus) => flat.filter((t) => t.status === status);

  const resetDrag = () => {
    setDragInfo(null);
    setDragOverColumn(null);
    setDropTarget(null);
  };

  const handleCardDragStart = (task: Task) => {
    setDragInfo({ taskId: task.id, sourceStatus: task.status });
    setDropTarget(null);
  };

  const handleCardDragOver = (e: React.DragEvent, taskId: string, status: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragInfo?.taskId === taskId) return;
    setDragOverColumn(status);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget((prev) => prev?.id === taskId && prev.pos === pos ? prev : { id: taskId, pos });
  };

  const handleColumnDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = dragInfo?.taskId ?? e.dataTransfer.getData("taskId");
    if (!taskId) { resetDrag(); return; }

    if (dragInfo?.sourceStatus === status && dropTarget && onReorder) {
      const colTasks = byStatus(status);
      const dragIdx = colTasks.findIndex((t) => t.id === taskId);
      if (dragIdx !== -1) {
        const reordered = [...colTasks];
        const [removed] = reordered.splice(dragIdx, 1);
        const newTargetIdx = reordered.findIndex((t) => t.id === dropTarget.id);
        if (newTargetIdx !== -1) {
          const insertAt = dropTarget.pos === "after" ? newTargetIdx + 1 : newTargetIdx;
          reordered.splice(insertAt, 0, removed);
          onReorder(reordered.map((t) => t.id));
        }
      }
    } else {
      onStatusChange(taskId, status);
    }
    resetDrag();
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px] min-w-0">
      {COLUMNS.map((col) => {
        const columnTasks = byStatus(col.status);
        const isOver = dragOverColumn === col.status;

        return (
          <div
            key={col.status}
            className="flex-shrink-0 w-64"
            onDragOver={(e) => handleColumnDragOver(e, col.status)}
            onDragLeave={() => { setDragOverColumn(null); setDropTarget(null); }}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl border mb-3 transition-colors ${
              isOver ? "border-indigo-300 bg-indigo-50" : `${col.headerBg} ${col.color}`
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{col.label}</span>
                <span className="text-xs text-gray-400">({columnTasks.length})</span>
              </div>
              <button
                onClick={() => onAddTask(col.status)}
                className="p-0.5 hover:bg-white rounded transition-colors text-gray-400 hover:text-gray-700"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cards */}
            <div className={`space-y-2.5 min-h-[80px] rounded-xl transition-colors p-1 -m-1 ${
              isOver && !dropTarget ? "bg-indigo-50/60 ring-2 ring-indigo-300 ring-dashed" : ""
            }`}>
              {columnTasks.map((task) => {
                const isDropBefore = dropTarget?.id === task.id && dropTarget.pos === "before";
                const isDropAfter = dropTarget?.id === task.id && dropTarget.pos === "after";
                return (
                  <div key={task.id}>
                    {isDropBefore && <div className="h-0.5 bg-indigo-500 rounded-full mx-1 mb-2" />}
                    <TaskCard
                      task={task}
                      onOpen={onOpen}
                      onStatusChange={onStatusChange}
                      onAddSubtask={onAddSubtask}
                      isDragging={dragInfo?.taskId === task.id}
                      onDragStart={() => handleCardDragStart(task)}
                      onCardDragOver={(e) => handleCardDragOver(e, task.id, col.status)}
                      onDragEnd={resetDrag}
                    />
                    {isDropAfter && <div className="h-0.5 bg-indigo-500 rounded-full mx-1 mt-2" />}
                  </div>
                );
              })}
              {columnTasks.length === 0 && !isOver && (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => onAddTask(col.status)}
                >
                  <p className="text-xs text-gray-400">Drop here or click +</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
