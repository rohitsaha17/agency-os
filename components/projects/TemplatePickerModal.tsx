"use client";

import { useEffect, useState } from "react";
import { Wand2, ChevronRight, Loader2, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface TemplateItem {
  id: string;
  title: string;
  priority: string;
  order: number;
  offsetDays: number | null;
  parentOrder: number | null;
}

interface Template {
  id: string;
  name: string;
  description: string;
  projectType: "ONE_TIME" | "RETAINER" | null;
  items: TemplateItem[];
}

interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectType?: "ONE_TIME" | "RETAINER";
  startDate?: string | null;
  /** Called after tasks are created so the parent can refetch the task list. */
  onApplied?: () => void;
}

export function TemplatePickerModal({
  open, onClose, projectId, projectType, startDate, onApplied,
}: TemplatePickerModalProps) {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/task-templates")
      .then((r) => r.json())
      .then((data: Template[]) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const apply = async (template: Template) => {
    setApplyingId(template.id);
    try {
      const res = await fetch(`/api/task-templates/${template.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, startDate: startDate ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Apply failed");
      toast.success(`Generated ${data.count} tasks from “${template.name}”`);
      onApplied?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply template");
    } finally {
      setApplyingId(null);
    }
  };

  // Sort templates: matching project type first, then the rest
  const sorted = [...templates].sort((a, b) => {
    const aMatch = projectType ? a.projectType === projectType : false;
    const bMatch = projectType ? b.projectType === projectType : false;
    if (aMatch === bMatch) return 0;
    return aMatch ? -1 : 1;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Tasks from Template"
      width="max-w-2xl"
      footer={<div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>Close</Button></div>}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-3">
          <Wand2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
            Pick a template to generate a complete task breakdown — including subtasks,
            priorities, and due dates calculated from the project start date.
            Tasks are added to this project; nothing is overwritten.
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No templates available.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((template) => {
              const isMatch = projectType && template.projectType === projectType;
              const isApplying = applyingId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => apply(template)}
                  disabled={!!applyingId}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all
                    ${isMatch
                      ? "border-indigo-300 dark:border-indigo-500/50 bg-indigo-50/40 dark:bg-indigo-500/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                      : "border-gray-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:bg-gray-50 dark:hover:bg-slate-800/60"
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed group`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isMatch
                      ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300"
                  }`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {template.name}
                      </p>
                      {isMatch && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {template.description}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                      {template.items.length} task{template.items.length !== 1 ? "s" : ""}
                      {template.projectType ? ` · ${template.projectType === "RETAINER" ? "Retainer" : "One-time"}` : ""}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isApplying ? (
                      <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}


      </div>
    </Modal>
  );
}
