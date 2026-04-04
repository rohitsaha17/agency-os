"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, CheckSquare, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Quotation, ProjectType } from "@/types";

interface ConvertModalProps {
  quotation: Quotation;
  onClose: () => void;
}

export function ConvertModal({ quotation, onClose }: ConvertModalProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    projectName: quotation.title,
    projectType: (quotation.pricingType === "RETAINER" ? "RETAINER" : "ONE_TIME") as ProjectType,
    startDate: "",
    createTasks: true,
  });
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversion failed");
      router.push(`/projects/${data.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setConverting(false);
    }
  };

  return (
    <Modal open title="Convert to Project" onClose={onClose} width="max-w-md">
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <p className="text-sm text-gray-600">
          This will create a new project linked to this quotation. The total ({quotation.currency} {Number(quotation.total).toLocaleString()}) will be set as the project budget.
        </p>

        {/* Project name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Project Name</label>
          <input
            type="text" value={form.projectName}
            onChange={(e) => setForm((p) => ({ ...p, projectName: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Project type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Project Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["ONE_TIME", "RETAINER"] as ProjectType[]).map((t) => (
              <button
                key={t} type="button"
                onClick={() => setForm((p) => ({ ...p, projectType: t }))}
                className={`p-3 rounded-xl border-2 text-left transition-colors ${
                  form.projectType === t ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className={`text-xs font-semibold ${form.projectType === t ? "text-indigo-700" : "text-gray-800"}`}>
                  {t === "ONE_TIME" ? "One-Time" : "Retainer"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Start date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date <span className="text-gray-400">(optional)</span></label>
          <input
            type="date" value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Auto-create tasks */}
        <label className="flex items-start gap-3 cursor-pointer p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <input
            type="checkbox" checked={form.createTasks}
            onChange={(e) => setForm((p) => ({ ...p, createTasks: e.target.checked }))}
            className="mt-0.5 w-4 h-4 accent-indigo-600"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
              <p className="text-sm font-medium text-indigo-900">Auto-create tasks from line items</p>
            </div>
            <p className="text-xs text-indigo-600 mt-0.5">
              Each line item becomes a task. Hourly items get estimated hours set automatically.
            </p>
          </div>
        </label>

        {/* Preview */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
            {form.projectName || "New Project"}
          </div>
          {form.createTasks && quotation.lineItems.length > 0 && (
            <div className="pl-5 space-y-1">
              {quotation.lineItems.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 text-gray-300" />
                  {item.title}
                </div>
              ))}
              {quotation.lineItems.length > 4 && (
                <div className="text-xs text-gray-400 pl-4">+{quotation.lineItems.length - 4} more tasks</div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={converting} onClick={handleConvert} icon={<ArrowRight className="w-3.5 h-3.5" />}>
            Convert to Project
          </Button>
        </div>
      </div>
    </Modal>
  );
}
