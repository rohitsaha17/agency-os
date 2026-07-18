"use client";

import { useState, useEffect } from "react";
import { Plus, X, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Task, TaskStatus } from "@/types";

interface Dep {
  taskId: string;
  dependsOnId: string;
  dependsOn?: { id: string; title: string; status: TaskStatus; priority: string };
  task?: { id: string; title: string; status: TaskStatus; priority: string };
}

interface Deps { dependsOn: Dep[]; blockedBy: Dep[] }

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  DONE:        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  IN_PROGRESS: <span className="w-3.5 h-3.5 rounded-full bg-blue-500 inline-block" />,
  IN_REVIEW:   <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 inline-block" />,
  BLOCKED:     <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  TODO:        <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 inline-block" />,
};

interface DependencyListProps {
  taskId: string;
  allTasks: Task[];     // All tasks in the project (for the picker)
}

export function DependencyList({ taskId, allTasks }: DependencyListProps) {
  const [deps, setDeps] = useState<Deps>({ dependsOn: [], blockedBy: [] });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/dependencies`)
      .then((r) => r.json())
      .then((data) => { if (data.dependsOn) setDeps(data); })
      .finally(() => setLoading(false));
  }, [taskId]);

  const availableTasks = allTasks.filter((t) => {
    if (t.id === taskId) return false;
    if (deps.dependsOn.some((d) => d.dependsOnId === t.id)) return false;
    if (deps.blockedBy.some((d) => d.taskId === t.id)) return false;
    return true;
  });

  const handleAdd = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === "string" ? data.error : data.error?.message ?? "Failed to add dependency"); return; }
      setDeps((prev) => ({ ...prev, dependsOn: [...prev.dependsOn, data] }));
      setSelectedId("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (dependsOnId: string) => {
    await fetch(`/api/tasks/${taskId}/dependencies/${dependsOnId}`, { method: "DELETE" });
    setDeps((prev) => ({
      ...prev,
      dependsOn: prev.dependsOn.filter((d) => d.dependsOnId !== dependsOnId),
    }));
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
    ))}</div>;
  }

  return (
    <div className="space-y-5">
      {/* This task depends on */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5" /> Depends On
          </h4>
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {deps.dependsOn.length === 0 && !adding && (
          <p className="text-xs text-gray-400 italic">No dependencies — this task can start anytime.</p>
        )}

        <div className="space-y-1.5">
          {deps.dependsOn.map((dep) => {
            const t = dep.dependsOn;
            if (!t) return null;
            const isBlocked = t.status !== "DONE";
            return (
              <div key={dep.dependsOnId} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                isBlocked ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"
              }`}>
                <span>{STATUS_ICON[t.status]}</span>
                <span className={`flex-1 truncate ${isBlocked ? "text-red-700" : "text-emerald-700"}`}>
                  {t.title}
                </span>
                {isBlocked && (
                  <span className="text-xs text-red-500 flex-shrink-0">blocking</span>
                )}
                <button onClick={() => handleRemove(dep.dependsOnId)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add form */}
        {adding && (
          <div className="mt-2 flex gap-2">
            {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Select task…</option>
              {availableTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedId || saving}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? "…" : "Add"}
            </button>
          </div>
        )}
      </div>

      {/* Tasks that block/depend on this */}
      {deps.blockedBy.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Blocks
          </h4>
          <div className="space-y-1.5">
            {deps.blockedBy.map((dep) => {
              const t = dep.task;
              if (!t) return null;
              return (
                <div key={dep.taskId} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                  <span>{STATUS_ICON[t.status]}</span>
                  <span className="flex-1 truncate text-gray-600">{t.title}</span>
                  <span className="text-xs text-gray-400">waiting</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
