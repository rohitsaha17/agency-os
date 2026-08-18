"use client";

import { useState, useRef } from "react";
import { X, Upload, Link2, MessageCircle, Hash, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DeliveryMethod } from "@/types";

const METHODS: { value: DeliveryMethod; label: string; icon: React.ElementType }[] = [
  { value: "FILE_UPLOAD", label: "Upload file", icon: Upload },
  { value: "LINK", label: "Attach link", icon: Link2 },
  { value: "WHATSAPP", label: "Sent via WhatsApp", icon: MessageCircle },
  { value: "SLACK", label: "Sent via Slack", icon: Hash },
  { value: "OTHER", label: "Other", icon: MoreHorizontal },
];

/**
 * v2 completion flow: shown whenever a task is being marked Done.
 * Records TaskDelivery proof (method + optional note/file/link) via
 * POST /api/tasks/[id]/delivery — which also flips the task to DONE.
 */
export function DeliveryDialog({
  taskId,
  taskTitle,
  onClose,
  onCompleted,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [method, setMethod] = useState<DeliveryMethod>("LINK");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadProof = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("taskId", taskId);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      const uploaded = Array.isArray(data) ? data[0] : data.files?.[0] ?? data;
      setFileId(uploaded.id ?? null);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const complete = async (skipProof: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          skipProof
            ? { skipProof: true }
            : { method, url: url || null, note: note || null, fileId },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to complete task");
      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  const showFileInput = method === "FILE_UPLOAD" || method === "WHATSAPP" || method === "SLACK";
  const showUrlInput = method === "LINK";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mark as delivered</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[300px]">{taskTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">How was it delivered?</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value} type="button" onClick={() => setMethod(value)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors ${
                    method === value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {showUrlInput && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Link</label>
              <input
                type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {showFileInput && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {method === "FILE_UPLOAD" ? "File" : "Proof screenshot (optional)"}
              </label>
              <input ref={fileRef} type="file" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                {uploading ? "Uploading…" : fileName ?? "Choose a file…"}
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Note (optional)</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="e.g. Final files shared in the client group"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => complete(true)}
            disabled={saving}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            skip proof
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" loading={saving} onClick={() => complete(false)}>
              Complete Task
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
