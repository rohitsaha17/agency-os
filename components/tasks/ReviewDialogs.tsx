"use client";

/**
 * v3 Phase 5 — the two dialogs that carry the accountability loop
 * (docs/V3_CONTEXT.md §3).
 *
 * SubmitWorkDialog  — the junior hands work in WITH PROOF.
 * RequestChangesDialog — the approver sends it back WITH A REASON.
 *
 * Both refuse to submit empty, because "it's done" with nothing attached is
 * exactly what this loop exists to prevent.
 */

import { useState, useRef } from "react";
import { Link2, Upload, MessageCircle, Hash, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Method = "LINK" | "FILE_UPLOAD" | "WHATSAPP" | "SLACK" | "OTHER";

const METHODS: { value: Method; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "LINK",        label: "Attach link",     icon: <Link2 className="w-3.5 h-3.5" />,          hint: "Paste where the work lives" },
  { value: "FILE_UPLOAD", label: "Upload file",     icon: <Upload className="w-3.5 h-3.5" />,         hint: "Attach the file itself" },
  { value: "WHATSAPP",    label: "Sent on WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" />, hint: "Say who you sent it to and when" },
  { value: "SLACK",       label: "Sent on Slack",   icon: <Hash className="w-3.5 h-3.5" />,           hint: "Say which channel" },
  { value: "OTHER",       label: "Other",           icon: <MoreHorizontal className="w-3.5 h-3.5" />, hint: "Explain how it was delivered" },
];

export function SubmitWorkDialog({
  taskId, taskTitle, revision, onClose, onSubmitted,
}: {
  taskId: string;
  taskTitle: string;
  revision?: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [method, setMethod] = useState<Method>("LINK");
  const [url, setUrl] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const chosen = METHODS.find((m) => m.value === method)!;
  // A submission needs SOMETHING — proof or, failing that, an explanation.
  const canSubmit = !!(url.trim() || fileId || remarks.trim());

  const upload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      const uploaded = Array.isArray(data) ? data[0] : data.files?.[0] ?? data;
      setFileId(uploaded.id ?? null);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, url: url.trim() || null, fileId, remarks: remarks.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Submit failed");
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Submit for approval</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {taskTitle}{(revision ?? 1) > 1 && ` · round ${revision}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">How was it delivered?</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 text-xs rounded-lg border transition-colors ${
                    method === m.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === "LINK" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Link</label>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}

          {method === "FILE_UPLOAD" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">File</label>
              <input ref={fileInput} type="file" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <button type="button" onClick={() => fileInput.current?.click()}
                className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                {uploading ? "Uploading…" : fileName ?? "Choose a file…"}
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Remarks
              {method !== "LINK" && method !== "FILE_UPLOAD" && <span className="text-red-500"> *</span>}
            </label>
            <textarea value={remarks} rows={3}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={chosen.hint}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {!canSubmit && (
            <p className="text-xs text-gray-400">
              Attach a link or file, or leave a remark — a submission needs something to review.
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!canSubmit || uploading} onClick={submit}>
            Submit for approval
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RequestChangesDialog({
  taskTitle, onCancel, onSubmit,
}: {
  taskTitle: string;
  onCancel: () => void;
  onSubmit: (comments: string) => void;
}) {
  const [comments, setComments] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Request changes</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{taskTitle}</p>
        </div>

        <div className="p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            What needs changing? <span className="text-red-500">*</span>
          </label>
          <textarea autoFocus value={comments} rows={4}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g. make the hook shorter"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          <p className="text-xs text-gray-400 mt-2">
            The same task reopens as the next round with the original brief intact,
            and this note pinned at the top.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!comments.trim()} onClick={() => onSubmit(comments.trim())}>
            Send back
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Closing a POST task: the content is live, optionally with a link. */
export function MarkPostedDialog({
  taskId, taskTitle, onClose, onPosted,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [liveUrl, setLiveUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/posted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveUrl: liveUrl.trim() || null }),
      });
      if (res.ok) onPosted();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Mark as posted</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{taskTitle}</p>
        </div>
        <div className="p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Live link <span className="font-normal text-gray-400">— optional</span>
          </label>
          <input type="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)}
            placeholder="https://instagram.com/p/…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-xs text-gray-400 mt-2">
            Worth pasting — it&rsquo;s the first thing a client asks for later.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={submit}>Mark posted</Button>
        </div>
      </div>
    </div>
  );
}
