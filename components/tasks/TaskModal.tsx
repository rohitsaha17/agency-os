"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Link2, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Task, TaskFormData, TaskStatus, Priority, User } from "@/types";
import { Select } from "@/components/ui/Select";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canAssignToUser } from "@/lib/permissions";

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
  topic: "", content: "", referenceUrl: "", referenceFileId: null,
  extraNote: "", clientId: "", preferredAssigneeId: "",
};

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <Select
        value={value}
        onChange={(v) => onChange(v)}
        options={[...options.map((o) => ({ value: o.value, label: `${o.label}` }))]}
      />
    </div>
  );
}

interface TaskModalProps {
  /** Fixed project context (project page). Omit for the global modal. */
  projectId?: string | null;
  /** When set (and no projectId), lets the user pick client + project. */
  global?: boolean;
  defaultStatus?: TaskStatus;
  parentTask?: Task | null;
  editTask?: Task | null;
  allTasks?: Task[];
  /** v2: prefill (used by the content calendar "Assign task" spine). */
  prefill?: Partial<TaskFormData> & { contentItemId?: string };
  onClose: () => void;
  onSaved: (task: Task) => void;
}

/** ISO instant -> the value a datetime-local input wants (local, no zone). */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskModal({
  projectId, global, defaultStatus, parentTask, editTask, allTasks = [], prefill, onClose, onSaved,
}: TaskModalProps) {
  const isEdit = Boolean(editTask);
  const isGlobal = !projectId && !isEdit;
  const [form, setForm] = useState<TaskFormData>({
    ...EMPTY,
    status: defaultStatus ?? "TODO",
    ...(prefill && { ...prefill }),
    ...(parentTask && { parentId: parentTask.id }),
    ...(editTask && {
      title: editTask.title,
      description: editTask.description ?? "",
      status: editTask.status,
      priority: editTask.priority,
      dueDate: editTask.dueDate ? toLocalInput(editTask.dueDate) : "",
      parentId: editTask.parentId,
      managerId: editTask.manager?.id ?? null,
      assigneeIds: editTask.assignees.map((a) => a.userId),
      estimatedHours: editTask.estimatedHours?.toString() ?? "",
      topic: editTask.topic ?? "",
      content: editTask.content ?? "",
      referenceUrl: editTask.referenceUrl ?? "",
      referenceFileId: editTask.referenceFileId ?? null,
      extraNote: editTask.extraNote ?? "",
      clientId: editTask.clientId ?? "",
      preferredAssigneeId: editTask.preferredAssigneeId ?? "",
    }),
  });
  const [users, setUsers] = useState<User[]>([]);
  const { user: me } = useCurrentUser();

  /**
   * Only the people this person may actually hand work to: an editor sees
   * themselves, an SMM adds juniors, a manager adds SMMs, an admin sees
   * everyone. POST /api/tasks enforces the same rule — this is the courtesy
   * layer, so a name the API would refuse never gets offered.
   *
   * Filtered here rather than when fetching, because `me` arrives from its own
   * request: filtering on arrival ran while `me` was still null, which matched
   * nobody and left the picker permanently empty.
   */
  const assignableUsers = useMemo<User[]>(
    () => users.filter((u) => canAssignToUser(me, u)),
    [users, me],
  );
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; clientId?: string; client?: { id: string } }[]>([]);
  const [pickedProjectId, setPickedProjectId] = useState<string>("");
  const [refMode, setRefMode] = useState<"url" | "file">("url");
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); });
    if (isGlobal) {
      fetch("/api/clients").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d); });
      fetch("/api/projects").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setProjects(d); });
    }
  }, [isGlobal]);

  const set = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleAssignee = (userId: string) => {
    set("assigneeIds", form.assigneeIds.includes(userId)
      ? form.assigneeIds.filter((id) => id !== userId)
      : [...form.assigneeIds, userId]);
  };

  const handleRefFile = async (file: File) => {
    setUploadingRef(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.clientId) fd.append("clientId", form.clientId);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      const uploaded = Array.isArray(data) ? data[0] : data.files?.[0] ?? data;
      set("referenceFileId", uploaded.id ?? null);
      setRefFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reference upload failed");
    } finally {
      setUploadingRef(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim() || form.topic?.trim() || "";
    if (!title) { setError("A title or topic is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        title,
        clientId: form.clientId || null,
        preferredAssigneeId: form.preferredAssigneeId || null,
        ...(isGlobal && { projectId: pickedProjectId || null }),
        ...(prefill?.contentItemId && { contentItemId: prefill.contentItemId }),
      };
      const url = isEdit
        ? `/api/tasks/${editTask!.id}`
        : projectId
          ? `/api/projects/${projectId}/tasks`
          : "/api/tasks";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const filteredProjects = form.clientId
    ? projects.filter((p) => (p.clientId ?? p.client?.id) === form.clientId)
    : projects;
  const isGeneral = isGlobal && !form.clientId && !pickedProjectId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit Task" : parentTask ? `Subtask of "${parentTask.title}"` : "New Task"}
            </h2>
            {isGeneral && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full">
                <Sparkles className="w-3 h-3" /> General task
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {isGeneral ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Title</label>
              <input
                autoFocus type="text" value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Topic</label>
                  <input
                    autoFocus type="text" value={form.topic ?? ""}
                    onChange={(e) => set("topic", e.target.value)}
                    placeholder="e.g. Diwali teaser"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Task Title <span className="text-gray-400 font-normal">(defaults to topic)</span>
                  </label>
                  <input
                    type="text" value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Content / Brief</label>
                <textarea
                  value={form.content ?? ""} onChange={(e) => set("content", e.target.value)}
                  rows={3} placeholder="Caption, copy, or brief for this deliverable…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </>
          )}

          {/* Reference: URL or file — a deliverable thing, not a to-do thing */}
          {!isGeneral && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-gray-700">Reference</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
                <button type="button" onClick={() => setRefMode("url")}
                  className={`px-2 py-0.5 flex items-center gap-1 ${refMode === "url" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500"}`}>
                  <Link2 className="w-3 h-3" /> URL
                </button>
                <button type="button" onClick={() => setRefMode("file")}
                  className={`px-2 py-0.5 flex items-center gap-1 ${refMode === "file" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500"}`}>
                  <Upload className="w-3 h-3" /> Upload
                </button>
              </div>
            </div>
            {refMode === "url" ? (
              <input
                type="text" inputMode="url" value={form.referenceUrl ?? ""}
                onChange={(e) => set("referenceUrl", e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <div>
                <input ref={fileInputRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRefFile(f); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  {uploadingRef ? "Uploading…" : refFileName ?? (form.referenceFileId ? "Reference file attached" : "Choose a file…")}
                </button>
              </div>
            )}
          </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description} onChange={(e) => set("description", e.target.value)}
              rows={2} placeholder="Additional details…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Client + Project (global modal only) */}
          {isGlobal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Client (optional)</label>
                <SelectInput
                  value={form.clientId ?? ""}
                  onChange={(v) => { set("clientId", v); setPickedProjectId(""); }}
                  options={[{ value: "", label: "No client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Project (optional)</label>
                <SelectInput
                  value={pickedProjectId}
                  onChange={setPickedProjectId}
                  options={[{ value: "", label: "No project" }, ...filteredProjects.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
              <SelectInput value={form.status} onChange={(v) => set("status", v as TaskStatus)} options={STATUS_OPTIONS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Priority</label>
              <SelectInput value={form.priority} onChange={(v) => set("priority", v as Priority)} options={PRIORITY_OPTIONS} />
            </div>
          </div>

          <div className={isGeneral ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {isGeneral ? "Due" : "Delivery Due Date"}
              </label>
              <input
                type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Estimating hours is a delivery conversation, not a to-do. */}
            {!isGeneral && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Est. Hours</label>
                <input
                  type="number" min="0" step="0.5" value={form.estimatedHours}
                  onChange={(e) => set("estimatedHours", e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          {!isGeneral && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Extra Note</label>
              <input
                type="text" value={form.extraNote ?? ""}
                onChange={(e) => set("extraNote", e.target.value)}
                placeholder="Anything the assignee should know…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Routing and review are project machinery — a to-do has neither. */}
          {!isGeneral && assignableUsers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Preference — editor/designer
                </label>
                <SelectInput
                  value={form.preferredAssigneeId ?? ""}
                  onChange={(v) => set("preferredAssigneeId", v)}
                  options={[{ value: "", label: "No preference" }, ...assignableUsers.map((u) => ({ value: u.id, label: u.name }))]}
                />
                {form.preferredAssigneeId && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Routed via Head of Design for approval.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Manager / Reviewer</label>
                <SelectInput
                  value={form.managerId ?? ""}
                  onChange={(v) => set("managerId", v || null)}
                  options={[{ value: "", label: "Unassigned" }, ...assignableUsers.map((u) => ({ value: u.id, label: u.name }))]}
                />
              </div>
            </div>
          )}

          {/* Assignees */}
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Assignees</label>
              <div className="flex flex-wrap gap-1.5">
                {assignableUsers.map((u) => (
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
                <Select
                  value={form.parentId ?? ""}
                  onChange={(v) => set("parentId", v || null)}
                  options={[{ value: "", label: "None (top-level)" }, ...parentOptions.map((o) => ({ value: o.value, label: `${o.label}` }))]}
                />
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
