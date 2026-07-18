"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Task, TaskFormData, TaskStatus, Priority, User } from "@/types";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "BLOCKED", label: "Blocked" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const EMPTY: TaskFormData = {
  title: "", description: "", status: "TODO", priority: "MEDIUM",
  dueDate: "", parentId: null, managerId: null,
  assigneeIds: [], estimatedHours: "",
};

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

interface TaskModalProps {
  projectId: string;
  defaultStatus?: TaskStatus;
  parentTask?: Task | null;
  editTask?: Task | null;
  allTasks?: Task[];
  onClose: () => void;
  onSaved: (task: Task) => void;
}

export function TaskModal({
  projectId, defaultStatus, parentTask, editTask, allTasks = [], onClose, onSaved,
}: TaskModalProps) {
  const isEdit = Boolean(editTask);
  const [form, setForm] = useState<TaskFormData>({
    ...EMPTY,
    status: defaultStatus ?? "TODO",
    ...(parentTask && { parentId: parentTask.id }),
    ...(editTask && {
      title: editTask.title,
      description: editTask.description ?? "",
      status: editTask.status,
      priority: editTask.priority,
      dueDate: editTask.dueDate ? editTask.dueDate.slice(0, 10) : "",
      parentId: editTask.parentId,
      managerId: editTask.manager?.id ?? null,
      assigneeIds: editTask.assignees.map((a) => a.userId),
      estimatedHours: editTask.estimatedHours?.toString() ?? "",
    }),
  });
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); });
  }, []);

  const set = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleAssignee = (userId: string) => {
    set("assigneeIds", form.assigneeIds.includes(userId)
      ? form.assigneeIds.filter((id) => id !== userId)
      : [...form.assigneeIds, userId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Task title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const url = isEdit ? `/api/tasks/${editTask!.id}` : `/api/projects/${projectId}/tasks`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      onSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  const parentOptions = allTasks
    .filter((t) => !isEdit || t.id !== editTask!.id)
    .map((t) => ({ value: t.id, label: t.title }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "Edit Task" : parentTask ? `Subtask of "${parentTask.title}"` : "New Task"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus type="text" value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description} onChange={(e) => set("description", e.target.value)}
              rows={3} placeholder="Additional details…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
              <SelectInput value={form.status} onChange={(v) => set("status", v as TaskStatus)} options={STATUS_OPTIONS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Priority</label>
              <SelectInput value={form.priority} onChange={(v) => set("priority", v as Priority)} options={PRIORITY_OPTIONS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Due Date</label>
              <input
                type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Est. Hours</label>
              <input
                type="number" min="0" step="0.5" value={form.estimatedHours}
                onChange={(e) => set("estimatedHours", e.target.value)}
                placeholder="e.g. 4"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Manager */}
          {users.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Manager / Reviewer</label>
                <div className="relative">
                  <select
                    value={form.managerId ?? ""}
                    onChange={(e) => set("managerId", e.target.value || null)}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div />
            </div>
          )}

          {/* Assignees */}
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Assignees</label>
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => (
                  <button
                    key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      form.assigneeIds.includes(u.id)
                        ? "bg-indigo-100 border-indigo-300 text-indigo-700 font-medium"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parent task */}
          {!parentTask && parentOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Parent Task (optional)</label>
              <div className="relative">
                <select
                  value={form.parentId ?? ""}
                  onChange={(e) => set("parentId", e.target.value || null)}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">None (top-level)</option>
                  {parentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" loading={saving} onClick={handleSubmit as never}>
            {isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </div>
      </div>
    </div>
  );
}
