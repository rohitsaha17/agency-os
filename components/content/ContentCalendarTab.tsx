"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar as CalIcon, List as ListIcon,
  LayoutGrid, Link2, Upload, Zap, ArrowRightCircle, CheckCircle2, UserPlus, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MonthGrid, MONTH_NAMES, isSameDay } from "@/components/calendar/MonthGrid";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { toast } from "@/lib/toast";
import type { ContentItem, ContentStatus, CreativeType, Task } from "@/types";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { Select } from "@/components/ui/Select";
import { todayKey, dateKey } from "@/lib/date-key";

// ── Status styling ───────────────────────────────────────────

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; chip: string; dot: string }> = {
  PLANNED:         { label: "Planned",         chip: "bg-gray-100 text-gray-600 border-gray-200",        dot: "bg-gray-400" },
  ASSIGNED:        { label: "Assigned",        chip: "bg-sky-50 text-sky-700 border-sky-200",            dot: "bg-sky-500" },
  IN_PROGRESS:     { label: "In Progress",     chip: "bg-blue-50 text-blue-700 border-blue-200",         dot: "bg-blue-500" },
  IN_REVIEW:       { label: "In Review",       chip: "bg-amber-50 text-amber-700 border-amber-200",      dot: "bg-amber-500" },
  TEAM_APPROVED:   { label: "Team Approved",   chip: "bg-lime-50 text-lime-700 border-lime-200",         dot: "bg-lime-500" },
  CLIENT_APPROVED: { label: "Client Approved", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  SCHEDULED:       { label: "Scheduled",       chip: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  POSTED:          { label: "Posted",          chip: "bg-indigo-50 text-indigo-700 border-indigo-200",   dot: "bg-indigo-600" },
  MISSED:          { label: "Missed",          chip: "bg-red-50 text-red-600 border-red-200",            dot: "bg-red-500" },
  // v3: the junior has sent work in and the SMM hasn't ruled on it yet.
  SUBMITTED:       { label: "Submitted",       chip: "bg-orange-50 text-orange-700 border-orange-200",   dot: "bg-orange-500" },
  // v3: the SMM approved it; the posting task now exists.
  APPROVED:        { label: "Approved",        chip: "bg-teal-50 text-teal-700 border-teal-200",         dot: "bg-teal-500" },
};

/**
 * What the chip on a content item should say.
 *
 * Reserving twelve Reel slots for a month and actually planning twelve Reels
 * are different acts, and PLANNED covered both — a freshly bulk-created slot
 * read "Planned" when nothing had been planned about it beyond the date and
 * the format. A slot carries a placeholder topic ("Reel 1") and no brief until
 * an SMM writes one, so an empty brief is what separates the two.
 *
 * The word is "Reserved", not "Scheduled": SCHEDULED is already a later stage
 * in the same pipeline (client-approved, queued to go out), and two things
 * called scheduled at opposite ends of the flow would be worse than the
 * problem being fixed.
 */
export function contentStatusChip(item: { status: ContentStatus; description: string | null }) {
  // Falls back rather than returning undefined: a status this build doesn't
  // know about should render as itself, not crash the calendar.
  const meta = CONTENT_STATUS_META[item.status] ?? {
    label: String(item.status), chip: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400",
  };
  // `description` is the ContentItem's brief. Required (not optional) in the
  // signature on purpose: an optional field would silently be `undefined` at
  // any call site that forgot to select it, and every planned item would then
  // read "Reserved".
  if (item.status === "PLANNED" && !item.description?.trim()) {
    return {
      ...meta,
      label: "Reserved",
      chip: "bg-slate-50 text-slate-500 border-slate-200 border-dashed",
    };
  }
  return meta;
}

const PIPELINE: ContentStatus[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW",
  "TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED", "POSTED",
];

function fmtDay(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Add/Edit item dialog ─────────────────────────────────────

function ItemDialog({
  clientId, types, editItem, defaultDate, quotaCheck, onClose, onSaved,
}: {
  clientId: string;
  types: CreativeType[];
  editItem?: ContentItem | null;
  defaultDate?: Date | null;
  /** Phase 6: (creativeTypeId) => { full: boolean, used: number, quota: number } */
  quotaCheck?: (creativeTypeId: string) => { full: boolean; used: number; quota: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    date: editItem ? editItem.date.slice(0, 10) : (defaultDate ? dateKey(defaultDate) : todayKey()),
    creativeTypeId: editItem?.creativeTypeId ?? types[0]?.id ?? "",
    topic: editItem?.topic ?? "",
    description: editItem?.description ?? "",
    referenceUrl: editItem?.referenceUrl ?? "",
    referenceFileId: editItem?.referenceFileId ?? null as string | null,
    isExtra: editItem?.isExtra ?? false,
    isAdHoc: editItem?.isAdHoc ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaPrompt, setQuotaPrompt] = useState<{ used: number; quota: number; typeName: string } | null>(null);
  // v3 Phase 0 (defect 5): Reference takes a URL *or* an upload, matching
  // the task modal. Same two-button toggle, same upload endpoint.
  const [refMode, setRefMode] = useState<"url" | "file">(
    editItem?.referenceFileId && !editItem?.referenceUrl ? "file" : "url",
  );
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRefFile = async (file: File) => {
    setUploadingRef(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      const uploaded = Array.isArray(data) ? data[0] : data.files?.[0] ?? data;
      setForm((f) => ({ ...f, referenceFileId: uploaded.id ?? null }));
      setRefFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reference upload failed");
    } finally {
      setUploadingRef(false);
    }
  };

  const submit = async (skipQuotaPrompt = false) => {
    if (!form.topic.trim()) { setError("Topic is required"); return; }
    if (!form.creativeTypeId) { setError("Pick a creative type"); return; }
    // Phase 6: quota-full confirm — offer to flag the item EXTRA
    if (!editItem && !skipQuotaPrompt && !form.isExtra && quotaCheck) {
      const q = quotaCheck(form.creativeTypeId);
      if (q.full) {
        setQuotaPrompt({
          used: q.used, quota: q.quota,
          typeName: types.find((t) => t.id === form.creativeTypeId)?.name ?? "this type",
        });
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editItem ? `/api/content-items/${editItem.id}` : "/api/content-items", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{editItem ? "Edit content" : "Add content"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

          {/* Phase 6: quota-full confirm */}
          {quotaPrompt && (
            <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-fuchsia-800">
                Quota for {quotaPrompt.typeName} is full ({quotaPrompt.used}/{quotaPrompt.quota}).
              </p>
              <p className="text-xs text-fuchsia-600 mt-0.5">Mark this as EXTRA? Extras can be billed on the next invoice.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setForm((f) => ({ ...f, isExtra: true })); setQuotaPrompt(null); setTimeout(() => submit(true), 0); }}
                  className="px-2.5 py-1 text-xs font-medium bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700">
                  Yes, mark EXTRA
                </button>
                <button
                  onClick={() => { setQuotaPrompt(null); submit(true); }}
                  className="px-2.5 py-1 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                  Add without EXTRA
                </button>
                <button onClick={() => setQuotaPrompt(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Creative Type <span className="text-red-500">*</span></label>
              <Select
                value={form.creativeTypeId}
                onChange={(v) => setForm((f) => ({ ...f, creativeTypeId: v }))}
                options={[...types.map((t) => ({ value: t.id, label: String(`${t.icon ? `${t.icon} ` : ""}${t.name}`) }))]}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Topic <span className="text-red-500">*</span></label>
            <input autoFocus type="text" value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. Diwali launch teaser"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={form.description} rows={3}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief / caption / notes for this deliverable…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          {/* Reference: URL or file — same control as the task modal */}
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
              <input type="text" inputMode="url" value={form.referenceUrl}
                onChange={(e) => setForm((f) => ({ ...f, referenceUrl: e.target.value }))}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isExtra}
                onChange={(e) => setForm((f) => ({ ...f, isExtra: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Extra (beyond package)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isAdHoc}
                onChange={(e) => setForm((f) => ({ ...f, isAdHoc: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Ad-hoc <Zap className="w-3 h-3 text-amber-500" />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => submit()}>{editItem ? "Save" : "Add content"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Item detail panel ────────────────────────────────────────

function ItemPanel({
  item, onClose, onChanged, onEdit,
}: {
  item: ContentItem;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const { user: currentUser } = useCurrentUser();
  const [assignOpen, setAssignOpen] = useState(false);
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryDate, setCarryDate] = useState(() => {
    const d = new Date(item.date);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState(false);

  const meta = contentStatusChip(item);
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "OWNER";
  const canTeamApprove = isAdmin || currentUser?.role === "MANAGER" || currentUser?.designation === "HEAD_OF_DESIGN";
  const canClientApprove = isAdmin || currentUser?.designation === "SMM" || currentUser?.designation === "POC";

  // When the last linked task completes and the item is pre-review, offer to
  // move the item to IN_REVIEW.
  useEffect(() => {
    const tasksDone = item.tasks.length > 0 && item.tasks.every((t) => t.status === "DONE");
    const preReview = ["ASSIGNED", "IN_PROGRESS"].includes(item.status);
    setReviewPrompt(tasksDone && preReview);
  }, [item]);

  const setStatus = async (status: ContentStatus, note?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/content-items/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error?.message ?? "Transition failed");
      } else {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const carryForward = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/content-items/${item.id}/carry-forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: carryDate }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error?.message ?? "Carry forward failed");
      } else {
        toast.success("Carried forward");
        setCarryOpen(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this content item?")) return;
    const res = await fetch(`/api/content-items/${item.id}`, { method: "DELETE" });
    if (res.ok) { onClose(); onChanged(); }
  };

  const dateIsPast = new Date(item.date) < new Date();
  const canCarry = dateIsPast && ["TEAM_APPROVED", "CLIENT_APPROVED"].includes(item.status);
  const idx = PIPELINE.indexOf(item.status as ContentStatus);
  const dueMinus2 = (() => {
    const d = new Date(item.date);
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-full sm:w-[440px] max-w-full bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CreativeTypeDot color={item.creativeType.color} size="md" />
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${meta.chip}`}>
                  {meta.label}
                </span>
                {item.isExtra && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-fuchsia-50 text-fuchsia-600 rounded-full border border-fuchsia-200">EXTRA</span>}
                {item.isAdHoc && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200 inline-flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />AD-HOC</span>}
              </div>
              <h2 className="text-base font-semibold text-gray-900 mt-1.5 leading-snug">{item.topic}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.creativeType.name} · {new Date(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {item.carriedFrom && <> · carried from {fmtDay(item.carriedFrom.date)}</>}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Review prompt */}
          {reviewPrompt && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-semibold text-amber-800">All linked tasks are done</p>
              <p className="text-xs text-amber-600 mt-0.5">Move this item to In Review?</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setStatus("IN_REVIEW", "all linked tasks completed")}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                  Yes, In Review
                </button>
                <button onClick={() => setReviewPrompt(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600">Not yet</button>
              </div>
            </div>
          )}

          {/* Description / reference */}
          {item.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
          )}
          {item.referenceUrl && (
            <a href={item.referenceUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 underline underline-offset-2 break-all">
              <Link2 className="w-3 h-3" /> {item.referenceUrl}
            </a>
          )}

          {/* Status stepper */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Pipeline</p>
            <div className="flex flex-wrap gap-1">
              {PIPELINE.map((s, i) => (
                <span key={s}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${i <= idx && item.status !== "MISSED" ? "bg-indigo-100 text-indigo-700 font-medium" : "bg-gray-50 text-gray-400"}`}>
                  {CONTENT_STATUS_META[s].label}
                </span>
              ))}
              {item.status === "MISSED" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">Missed</span>
              )}
            </div>

            {/* Action buttons — gated */}
            <div className="flex flex-wrap gap-2 mt-3">
              {item.status === "IN_REVIEW" && canTeamApprove && (
                <button onClick={() => setStatus("TEAM_APPROVED")} disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium bg-lime-600 text-white rounded-lg hover:bg-lime-700">
                  Team Approve
                </button>
              )}
              {item.status === "TEAM_APPROVED" && canClientApprove && (
                <button onClick={() => setStatus("CLIENT_APPROVED", "manual client approval")} disabled={busy}
                  title="Manual fallback — or share the review link below"
                  className="px-2.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                  Mark Client Approved
                </button>
              )}
              {item.status === "TEAM_APPROVED" && (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/content-items/${item.id}/share`, { method: "POST" });
                    const d = await res.json();
                    if (!res.ok) { toast.error(d.error?.message ?? "Failed"); return; }
                    const url = `${window.location.origin}${d.url}`;
                    try { await navigator.clipboard.writeText(url); toast.success(`Review link copied: ${url}`); }
                    catch { toast.success(`Review link: ${url}`); }
                  }}
                  disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 inline-flex items-center gap-1">
                  <Share2 className="w-3 h-3" /> Share for approval
                </button>
              )}
              {item.reviewToken && (
                <button
                  onClick={async () => {
                    await fetch(`/api/content-items/${item.id}/share`, { method: "DELETE" });
                    toast.success("Review link revoked");
                    onChanged();
                  }}
                  className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-500 underline underline-offset-2">
                  Revoke link
                </button>
              )}
              {item.status === "CLIENT_APPROVED" && (
                <button onClick={() => setStatus("SCHEDULED")} disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                  Mark Scheduled
                </button>
              )}
              {["CLIENT_APPROVED", "SCHEDULED"].includes(item.status) && (
                <button onClick={() => setStatus("POSTED")} disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Mark Posted
                </button>
              )}
              {["ASSIGNED", "IN_PROGRESS"].includes(item.status) && (
                <button onClick={() => setStatus("IN_REVIEW")} disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                  Move to In Review
                </button>
              )}
              {canCarry && (
                <button onClick={() => setCarryOpen(true)} disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 inline-flex items-center gap-1">
                  <ArrowRightCircle className="w-3 h-3" /> Carry forward
                </button>
              )}
            </div>

            {/* Timestamps */}
            <div className="mt-3 space-y-0.5 text-[11px] text-gray-400">
              {item.teamApprovedAt && <p>Team approved {fmtDay(item.teamApprovedAt)}</p>}
              {item.clientApprovedAt && <p>Client approved {fmtDay(item.clientApprovedAt)}</p>}
              {item.postedAt && <p>Posted {fmtDay(item.postedAt)}</p>}
            </div>
          </div>

          {/* Phase 6: carried-in accounting toggle */}
          {item.carriedFromId && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer border border-orange-100 bg-orange-50/50 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={item.countAgainstPrevMonth}
                onChange={async (e) => {
                  await fetch(`/api/content-items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ countAgainstPrevMonth: e.target.checked }),
                  });
                  onChanged();
                }}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              Count against previous month&apos;s quota
            </label>
          )}

          {/* Carry-forward date picker */}
          {carryOpen && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <p className="text-xs font-semibold text-orange-800 mb-2">Carry this item to:</p>
              <div className="flex gap-2">
                <input type="date" value={carryDate} onChange={(e) => setCarryDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-orange-200 rounded-lg bg-white" />
                <button onClick={carryForward} disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                  Carry
                </button>
                <button onClick={() => setCarryOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
              <p className="text-[10px] text-orange-600 mt-1.5">Approvals ride along; the original is marked Missed.</p>
            </div>
          )}

          {/* Linked tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Linked tasks</p>
              <button onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg">
                <UserPlus className="w-3 h-3" /> Assign task
              </button>
            </div>
            {item.tasks.length === 0 ? (
              <p className="text-xs text-gray-400">No tasks yet — “Assign task” creates one prefilled from this entry.</p>
            ) : (
              <ul className="space-y-1.5">
                {item.tasks.map((t) => (
                  <li key={t.id}>
                    <a
                      href={t.projectId ? `/projects/${t.projectId}?task=${t.id}` : `/tasks?task=${t.id}`}
                      className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                    >
                      {t.status === "DONE"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        : <span className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                      <span className="text-xs text-gray-700 flex-1 truncate">{t.title}</span>
                      {t.assignees.slice(0, 3).map((a) => (
                        <span key={a.user.id} title={a.user.name}
                          className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center">
                          {a.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </span>
                      ))}
                      <span className="text-[10px] text-gray-400">{t.status.replace("_", " ")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between">
          <button onClick={remove} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
          <button onClick={onEdit} className="text-xs font-medium text-indigo-600 hover:underline">Edit details</button>
        </div>
      </div>

      {/* Assign-task modal — the SPINE: prefilled from this entry */}
      {assignOpen && (
        <TaskModal
          global
          prefill={{
            topic: item.topic,
            title: item.topic,
            content: item.description ?? "",
            referenceUrl: item.referenceUrl ?? "",
            clientId: item.clientId,
            dueDate: dueMinus2,
            contentItemId: item.id,
          }}
          onClose={() => setAssignOpen(false)}
          onSaved={() => { setAssignOpen(false); onChanged(); }}
        />
      )}
    </>
  );
}

// ── Main tab ─────────────────────────────────────────────────

/**
 * v3: at CLIENT level this is a read-only roll-up of every project's plan
 * (docs/V3_CONTEXT.md §4). Work is created on Project ▸ Plan, so the client
 * view shows what's happening and links through rather than editing here.
 */
export function ContentCalendarTab({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [items, setItems] = useState<ContentItem[]>([]);
  const [types, setTypes] = useState<CreativeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "list">("month");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; edit?: ContentItem | null; date?: Date | null }>({ open: false });
  const [panelItemId, setPanelItemId] = useState<string | null>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const [summary, setSummary] = useState<{
    perType: { creativeType: { id: string; name: string; icon: string | null; color: string | null }; quota: number; planned: number; posted: number; extra: number; carriedIn: number; carriedOut: number }[];
    totals: { extra: number; carriedIn: number; carriedOut: number };
  } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sumRes] = await Promise.all([
        fetch(`/api/content-items?clientId=${clientId}&month=${monthKey}`),
        fetch(`/api/clients/${clientId}/month-summary?month=${monthKey}`),
      ]);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      if (sumRes.ok) setSummary(await sumRes.json());
    } finally {
      setLoading(false);
    }
  }, [clientId, monthKey]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    fetch("/api/creative-types").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setTypes(d); });
  }, []);

  const prevMonth = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  const itemsOnDay = useCallback(
    (day: Date) => items.filter((i) => isSameDay(new Date(i.date), day)),
    [items],
  );

  // v3: which projects contributed to this month, each with a stable colour
  // so the roll-up reads as "who is doing what" at a glance.
  const projectsInMonth = useMemo(() => {
    const palette = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const i of items) {
      const p = (i as { project?: { id: string; name: string } | null }).project;
      if (!p || seen.has(p.id)) continue;
      seen.set(p.id, { id: p.id, name: p.name, color: palette[seen.size % palette.length] });
    }
    return [...seen.values()];
  }, [items]);

  const projectColor = useCallback(
    (item: ContentItem) => {
      const p = (item as { project?: { id: string } | null }).project;
      return p ? projectsInMonth.find((x) => x.id === p.id)?.color : undefined;
    },
    [projectsInMonth],
  );

  const counters = useMemo(() => ({
    planned: items.filter((i) => i.status !== "MISSED").length,
    posted: items.filter((i) => i.status === "POSTED").length,
    extra: items.filter((i) => i.isExtra).length,
    carried: items.filter((i) => !!i.carriedFromId).length,
  }), [items]);

  const carryCandidates = useMemo(
    () => items.filter((i) =>
      new Date(i.date) < now &&
      ["TEAM_APPROVED", "CLIENT_APPROVED"].includes(i.status)),
    [items, now],
  );

  const panelItem = panelItemId ? items.find((i) => i.id === panelItemId) ?? null : null;
  const dayItems = selectedDay ? itemsOnDay(selectedDay) : [];

  return (
    <div>
      {/* Month header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[130px] text-center">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-50 text-gray-600"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => setView("month")}
              className={`px-2.5 py-1.5 font-medium flex items-center gap-1 ${view === "month" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Month
            </button>
            <button onClick={() => setView("list")}
              className={`px-2.5 py-1.5 font-medium flex items-center gap-1 ${view === "list" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
              <ListIcon className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span><b className="text-gray-800">{counters.planned}</b> planned</span>
            <span><b className="text-indigo-700">{counters.posted}</b> posted</span>
            <span><b className="text-fuchsia-600">{counters.extra}</b> extra</span>
            <span><b className="text-orange-600">{counters.carried}</b> carried</span>
          </div>
          {/* v3: this view rolls up every project — planning happens there */}
          {readOnly && projectsInMonth.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {projectsInMonth.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}?tab=plan`}
                  title={`Plan in ${p.name}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors hover:bg-gray-50"
                  style={{ borderColor: `${p.color}55`, color: p.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                  Plan in {p.name}
                </Link>
              ))}
            </div>
          )}
          <button
            title="Create a public review link listing every team-approved item this month"
            onClick={async () => {
              const res = await fetch(`/api/clients/${clientId}/share-month`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: monthKey }),
              });
              const d = await res.json();
              if (!res.ok) { toast.error(d.error?.message ?? "Failed"); return; }
              const url = `${window.location.origin}${d.url}`;
              try { await navigator.clipboard.writeText(url); toast.success(`Month review link copied: ${url}`); }
              catch { toast.success(`Month review link: ${url}`); }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50">
            <Share2 className="w-3.5 h-3.5" /> Share month
          </button>
          {!readOnly && (
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setDialog({ open: true, date: selectedDay ?? null })}>
              Add content
            </Button>
          )}
        </div>
      </div>

      {/* Phase 6: per-type usage meters */}
      {summary && summary.perType.some((r) => r.quota > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-xl">
          {summary.perType.filter((r) => r.quota > 0).map((r) => {
            const used = r.planned + r.posted;
            const pct = Math.min((used / r.quota) * 100, 100);
            const over = used > r.quota;
            return (
              <div key={r.creativeType.id} className="flex items-center gap-1.5" title={`${r.creativeType.name}: ${used}/${r.quota} used this month`}>
                <CreativeTypeDot color={r.creativeType.color} />
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${over ? "bg-fuchsia-500" : pct >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-[10px] font-semibold ${over ? "text-fuchsia-600" : "text-gray-600"}`}>{used}/{r.quota}</span>
              </div>
            );
          })}
          {summary.totals.extra > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-fuchsia-50 text-fuchsia-600 rounded-full border border-fuchsia-200">
              {summary.totals.extra} EXTRA
            </span>
          )}
          {(summary.totals.carriedIn > 0 || summary.totals.carriedOut > 0) && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded-full border border-orange-200">
              {summary.totals.carriedIn} in / {summary.totals.carriedOut} out carried
            </span>
          )}
        </div>
      )}

      {/* Month-end carry banner */}
      {carryCandidates.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 flex items-center gap-2">
          <ArrowRightCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <b>{carryCandidates.length}</b> approved item{carryCandidates.length !== 1 ? "s" : ""} not posted — open {carryCandidates.length !== 1 ? "them" : "it"} to carry forward.
          </span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {view === "month" ? (
            <MonthGrid
              view="month"
              year={year}
              month={month}
              selected={selectedDay}
              loading={loading}
              onDayClick={(day) => setSelectedDay(selectedDay && isSameDay(day, selectedDay) ? null : day)}
              cellCount={(day) => itemsOnDay(day).length}
              renderCell={(day) => {
                const dayList = itemsOnDay(day);
                return (
                  <>
                    {dayList.slice(0, 3).map((i) => {
                      const meta = contentStatusChip(i);
                      return (
                        <button
                          key={i.id}
                          onClick={(e) => { e.stopPropagation(); setPanelItemId(i.id); }}
                          title={`${i.creativeType.name}: ${i.topic} (${meta.label})`}
                          className={`w-full flex items-center gap-1 mb-0.5 px-1 py-0.5 rounded border text-left ${meta.chip} ${i.isAdHoc ? "border-dashed" : ""}`}
                        >
                          {/* v3 roll-up: a colour bar says which project this
                              belongs to without stealing room from the topic */}
                          {readOnly && projectColor(i) && (
                            <span className="w-0.5 h-3 rounded-full flex-shrink-0"
                              style={{ background: projectColor(i) }} />
                          )}
                          <CreativeTypeDot color={i.creativeType.color} />
                          <span className="text-[10px] truncate leading-tight flex-1">{i.topic}</span>
                          {i.isExtra && <span className="text-[8px] font-bold text-fuchsia-500">E</span>}
                          {i.isAdHoc && <Zap className="w-2 h-2 text-amber-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                    {dayList.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{dayList.length - 3} more</span>
                    )}
                  </>
                );
              }}
            />
          ) : (
            /* List / agenda view */
            loading ? (
              <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : items.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <CalIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nothing planned for {MONTH_NAMES[month]}.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {items.map((i, idx) => {
                  const meta = contentStatusChip(i);
                  return (
                    <button key={i.id} onClick={() => setPanelItemId(i.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 ${idx > 0 ? "border-t border-gray-100" : ""}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                      <span className="text-xs text-gray-400 w-14 flex-shrink-0">{fmtDay(i.date)}</span>
                      <CreativeTypeDot color={i.creativeType.color} />
                      <span className="text-sm text-gray-800 truncate flex-1">{i.topic}</span>
                      {i.isExtra && <span className="text-[10px] font-semibold text-fuchsia-600">EXTRA</span>}
                      {i.isAdHoc && <Zap className="w-3 h-3 text-amber-500" />}
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Day side panel */}
        {selectedDay && view === "month" && (
          <div className="lg:w-72 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4 self-start">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </h3>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {dayItems.length === 0 ? (
              <p className="text-xs text-gray-400 mb-3">Nothing planned this day.</p>
            ) : (
              <ul className="space-y-1.5 mb-3">
                {dayItems.map((i) => {
                  const meta = contentStatusChip(i);
                  return (
                    <li key={i.id}>
                      <button onClick={() => setPanelItemId(i.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${meta.chip}`}>
                        <CreativeTypeDot color={i.creativeType.color} />
                        <span className="text-xs truncate flex-1">{i.topic}</span>
                        <span className="text-[9px] font-medium uppercase">{meta.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!readOnly && (
              <button
                onClick={() => setDialog({ open: true, date: selectedDay })}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50">
                <Plus className="w-3.5 h-3.5" /> Add content
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog.open && (
        <ItemDialog
          clientId={clientId}
          types={types}
          editItem={dialog.edit}
          defaultDate={dialog.date}
          quotaCheck={(creativeTypeId) => {
            const row = summary?.perType.find((r) => r.creativeType.id === creativeTypeId);
            const used = row ? row.planned + row.posted : 0;
            const quota = row?.quota ?? 0;
            return { full: quota > 0 && used >= quota, used, quota };
          }}
          onClose={() => setDialog({ open: false })}
          onSaved={() => { setDialog({ open: false }); fetchItems(); }}
        />
      )}
      {panelItem && (
        <ItemPanel
          item={panelItem}
          onClose={() => setPanelItemId(null)}
          onChanged={fetchItems}
          onEdit={() => setDialog({ open: true, edit: panelItem })}
        />
      )}
    </div>
  );
}
