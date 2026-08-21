"use client";

/**
 * v3 Phase 3 — the Project ▸ Plan tab: where a month gets planned.
 *
 * This is the SMM's home. It shows one cycle at a time, what that cycle owes
 * (quota meters built from the project's deliverables), and the content
 * planned into it — on the shared MonthGrid, not a forked one
 * (docs/V3_CONTEXT.md Prime Directive: "Reuse components").
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, List as ListIcon,
  Layers, Lock, Unlock, AlertTriangle,
} from "lucide-react";
import { MonthGrid, MONTH_NAMES } from "@/components/calendar/MonthGrid";
import { CONTENT_STATUS_META, contentStatusChip } from "@/components/content/ContentCalendarTab";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { CloseCycleWizard } from "@/components/projects/CloseCycleWizard";
import { broadcastChange } from "@/lib/live";
import type { ContentStatus } from "@/types";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { Select } from "@/components/ui/Select";

// ── shapes the plan endpoint returns ──

interface QuotaRow {
  creativeType: { id: string; name: string; icon: string | null; color: string | null };
  quota: number;
  planned: number;
  posted: number;
  extra: number;
  carriedInExtra: number;
  carriedInQuota: number;
  full: boolean;
}

interface PlanCycle {
  id: string; label: string; status: "OPEN" | "CLOSED";
  startDate: string; endDate: string;
}

interface PlanItem {
  id: string;
  date: string;
  topic: string;
  description: string | null;
  status: ContentStatus;
  referenceUrl: string | null;
  isExtra: boolean;
  isAdHoc: boolean;
  billingIntent: "INCLUDED" | "EXTRA_BILLABLE" | "COMPLIMENTARY";
  carriedFromId: string | null;
  carryMode: "INSIDE_QUOTA" | "ABOVE_QUOTA" | null;
  creativeType: { id: string; name: string; icon: string | null; color: string | null };
  tasks: { id: string; status: string; assignees: { user: { id: string; name: string } }[] }[];
}

interface PlanPayload {
  project: { id: string; name: string; type: string; client: { id: string; name: string } };
  cycles: PlanCycle[];
  cycle: PlanCycle | null;
  summary: { perType: QuotaRow[]; totals: { quota: number; planned: number; posted: number; extra: number; missed: number } } | null;
  items: PlanItem[];
  canPlan: boolean;
  canOverrideBilling: boolean;
  canClose: boolean;
  canReopen: boolean;
}

/** A meter reads "Reels 4/15" with the bar filling as the cycle is planned. */
function QuotaMeter({ row }: { row: QuotaRow }) {
  const pct = row.quota > 0 ? Math.min(100, (row.planned / row.quota) * 100) : 0;
  const postedPct = row.quota > 0 ? Math.min(100, (row.posted / row.quota) * 100) : 0;
  return (
    <div className="min-w-[150px] flex-1">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-700 truncate">
          {row.creativeType.icon && <span className="mr-1">{row.creativeType.icon}</span>}
          {row.creativeType.name}
        </span>
        <span className={`text-xs tabular-nums ${row.full ? "text-amber-600 font-semibold" : "text-gray-500"}`}>
          {row.planned}/{row.quota || "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden relative">
        <div className={`h-full rounded-full transition-all ${row.full ? "bg-amber-400" : "bg-indigo-400"}`}
          style={{ width: `${pct}%` }} />
        <div className="h-full rounded-full bg-emerald-500 absolute inset-y-0 left-0 transition-all"
          style={{ width: `${postedPct}%` }} />
      </div>
      {(row.extra > 0 || row.carriedInExtra > 0 || row.carriedInQuota > 0) && (
        <p className="text-[10px] mt-1 space-x-1">
          {row.extra > 0 && <span className="text-amber-600">+{row.extra} extra</span>}
          {row.carriedInExtra > 0 && (
            <span className="text-amber-600">{row.carriedInExtra} carried in (extra)</span>
          )}
          {row.carriedInQuota > 0 && (
            <span className="text-indigo-500">{row.carriedInQuota} carried in</span>
          )}
        </p>
      )}
    </div>
  );
}

export function PlanTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<PlanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "list">("month");
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editItem, setEditItem] = useState<PlanItem | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    const url = cycleId
      ? `/api/projects/${projectId}/plan?cycleId=${cycleId}`
      : `/api/projects/${projectId}/plan`;
    const res = await fetch(url);
    if (res.ok) {
      const payload: PlanPayload = await res.json();
      setData(payload);
      if (!cycleId && payload.cycle) setCycleId(payload.cycle.id);
    }
    setLoading(false);
  }, [projectId, cycleId]);

  useEffect(() => { load(); }, [load]);

  const cycleIndex = useMemo(
    () => (data?.cycles ?? []).findIndex((c) => c.id === data?.cycle?.id),
    [data],
  );

  const itemsOn = useCallback(
    (day: Date) =>
      (data?.items ?? []).filter((i) => {
        const d = new Date(i.date);
        return d.getUTCFullYear() === day.getFullYear()
          && d.getUTCMonth() === day.getMonth()
          && d.getUTCDate() === day.getDate();
      }),
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data?.cycle) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
        <CalIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">This project has no cycles yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Set a period on the project (Edit ▸ Commercials) and cycles appear here.
        </p>
      </div>
    );
  }

  const cycle = data.cycle;
  const cycleStart = new Date(cycle.startDate);
  const closed = cycle.status === "CLOSED";

  /**
   * Reopening is a manager's call and is written to the history. It also
   * withdraws the billing lines the close produced, so any amount already
   * typed on an extra is lost — worth saying out loud before it happens.
   */
  const reopen = async () => {
    const ok = window.confirm(
      `Reopen ${cycle.label}?\n\n`
      + "The billing lines this close produced will be withdrawn, including any "
      + "amounts already entered. They are regenerated when you close it again.",
    );
    if (!ok) return;
    const res = await fetch(`/api/cycles/${cycle.id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "reopened from the plan" }),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error?.message ?? "Couldn't reopen"); return; }
    toast.success(
      d.pricedLost > 0
        ? `${cycle.label} reopened — ${d.pricedLost} priced line${d.pricedLost === 1 ? "" : "s"} withdrawn`
        : `${cycle.label} reopened`,
    );
    setLoading(true); load(); broadcastChange("all");
  };

  const goCycle = (delta: number) => {
    const next = data.cycles[cycleIndex + delta];
    if (next) { setCycleId(next.id); setLoading(true); }
  };

  return (
    <div className="space-y-4">
      {/* ── Cycle bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => goCycle(-1)} disabled={cycleIndex <= 0}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[92px] text-center">
            {cycle.label}
          </span>
          <button onClick={() => goCycle(1)} disabled={cycleIndex >= data.cycles.length - 1}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {closed && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
            <Lock className="w-3 h-3" /> Closed — read only
          </span>
        )}

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs ml-auto">
          <button onClick={() => setView("month")}
            className={`px-2.5 py-1.5 flex items-center gap-1.5 ${view === "month" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
            <CalIcon className="w-3.5 h-3.5" /> Month
          </button>
          <button onClick={() => setView("list")}
            className={`px-2.5 py-1.5 flex items-center gap-1.5 border-l border-gray-200 ${view === "list" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
            <ListIcon className="w-3.5 h-3.5" /> List
          </button>
        </div>

        {data.canPlan && (
          <>
            <Button size="sm" variant="secondary" icon={<Layers className="w-3.5 h-3.5" />}
              onClick={() => setBulkOpen(true)}>
              Add multiple
            </Button>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setDialogDate(cycleStart)}>
              Add content
            </Button>
          </>
        )}

        {/* v3: ending the month is a deliberate act, not a date passing */}
        {data.canPlan && data.canClose && (
          <Button size="sm" variant="secondary" icon={<Lock className="w-3.5 h-3.5" />}
            onClick={() => setClosing(true)}>
            Close cycle
          </Button>
        )}
        {closed && data.canReopen && (
          <Button size="sm" variant="secondary" icon={<Unlock className="w-3.5 h-3.5" />}
            onClick={reopen}>
            Reopen
          </Button>
        )}
      </div>

      {/* ── Quota meters ── */}
      {data.summary && data.summary.perType.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            {data.summary.perType.map((row) => (
              <QuotaMeter key={row.creativeType.id} row={row} />
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
            <span><span className="font-semibold text-gray-700">{data.summary.totals.planned}</span> planned</span>
            <span><span className="font-semibold text-emerald-600">{data.summary.totals.posted}</span> posted</span>
            {data.summary.totals.extra > 0 && (
              <span className="text-amber-600"><span className="font-semibold">{data.summary.totals.extra}</span> extra</span>
            )}
            {data.summary.totals.missed > 0 && (
              <span className="text-red-500"><span className="font-semibold">{data.summary.totals.missed}</span> missed</span>
            )}
            <span className="ml-auto text-gray-400">
              Pricing is set by your manager
            </span>
          </div>
        </div>
      )}

      {/* ── The plan itself ── */}
      {view === "month" ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <MonthGrid
            view="month"
            year={cycleStart.getUTCFullYear()}
            month={cycleStart.getUTCMonth()}
            onDayClick={(day) => data.canPlan && setDialogDate(day)}
            cellCount={(day) => itemsOn(day).length}
            renderCell={(day) => (
              <>
                {itemsOn(day).slice(0, 3).map((i) => {
                  const meta = contentStatusChip(i);
                  const assignee = i.tasks[0]?.assignees[0]?.user.name;
                  return (
                    <button key={i.id} type="button"
                      onClick={(e) => { e.stopPropagation(); setEditItem(i); }}
                      title={`${i.creativeType.name}: ${i.topic}${assignee ? ` — ${assignee}` : ""}`}
                      className={`w-full text-left flex items-center gap-1 mb-0.5 px-1 py-0.5 rounded border ${meta?.chip ?? "bg-gray-100 border-gray-200"} ${i.isExtra ? "border-dashed" : ""}`}>
                      <CreativeTypeDot color={i.creativeType.color} />
                      <span className="text-[10px] truncate leading-tight flex-1">{i.topic}</span>
                      {assignee && (
                        <span className="w-3.5 h-3.5 rounded-full bg-white/70 text-[7px] font-bold flex items-center justify-center flex-shrink-0">
                          {assignee.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </span>
                      )}
                    </button>
                  );
                })}
                {itemsOn(day).length > 3 && (
                  <span className="text-[9px] text-gray-400">+{itemsOn(day).length - 3} more</span>
                )}
              </>
            )}
          />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {data.items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Nothing planned in this cycle yet.</p>
          ) : data.items.map((i) => {
            const meta = contentStatusChip(i);
            const assignee = i.tasks[0]?.assignees[0]?.user.name;
            return (
              <button key={i.id} type="button" onClick={() => setEditItem(i)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0 tabular-nums">
                  {new Date(i.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                </span>
                <CreativeTypeDot color={i.creativeType.color} />
                <span className="text-sm text-gray-800 flex-1 truncate">{i.topic}</span>
                {i.isExtra && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium flex-shrink-0">
                    Extra
                  </span>
                )}
                {assignee && <span className="text-xs text-gray-500 flex-shrink-0">{assignee}</span>}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${meta?.chip ?? "bg-gray-100"}`}>
                  {meta?.label ?? i.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(dialogDate || editItem) && (
        <PlanItemDialog
          projectId={projectId}
          clientId={data.project.client.id}
          cycleId={cycle.id}
          date={dialogDate}
          item={editItem}
          canOverrideBilling={data.canOverrideBilling}
          onClose={() => { setDialogDate(null); setEditItem(null); }}
          onSaved={() => { setDialogDate(null); setEditItem(null); setLoading(true); load(); broadcastChange("all"); }}
        />
      )}

      {closing && (
        <CloseCycleWizard
          cycleId={cycle.id}
          onClose={() => setClosing(false)}
          onClosed={() => { setClosing(false); setLoading(true); load(); broadcastChange("all"); }}
        />
      )}

      {bulkOpen && (
        <BulkPlanDialog
          projectId={projectId}
          cycleStart={cycleStart}
          types={(data.summary?.perType ?? []).map((r) => r.creativeType)}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); setLoading(true); load(); broadcastChange("all"); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Add / edit one planned item — with the inline "assign to"
   that turns planning into someone's task in one action.
   ───────────────────────────────────────────────────────────── */
/**
 * When the editor's work is due, which is not when the content goes out.
 *
 * A reel scheduled for the 10th is wanted in hand before the 10th — there has
 * to be room to review it and fix it. Two days ahead at 6pm is the house
 * default; the SMM can move it.
 */
function defaultDeadline(publishIso: string) {
  const d = new Date(publishIso);
  d.setDate(d.getDate() - 2);
  d.setHours(18, 0, 0, 0);
  // datetime-local wants local time with no zone suffix.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlanItemDialog({
  projectId, clientId, cycleId, date, item, canOverrideBilling, onClose, onSaved,
}: {
  projectId: string;
  clientId: string;
  cycleId: string;
  date: Date | null;
  item: PlanItem | null;
  canOverrideBilling: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [types, setTypes] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [juniors, setJuniors] = useState<{ id: string; name: string; jobTitle?: { name: string } | null }[]>([]);
  const [form, setForm] = useState({
    date: item
      ? item.date.slice(0, 10)
      : (date ?? new Date()).toISOString().slice(0, 10),
    creativeTypeId: item?.creativeType.id ?? "",
    topic: item?.topic ?? "",
    description: item?.description ?? "",
    referenceUrl: item?.referenceUrl ?? "",
    assigneeId: item?.tasks[0]?.assignees[0]?.user.id ?? "",
    taskDueAt: defaultDeadline(item ? item.date : (date ?? new Date()).toISOString()),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraPrompt, setExtraPrompt] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    fetch("/api/creative-types").then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTypes(d); });
    // Only people whose designation can actually be given work
    fetch("/api/users?assignableOnly=1").then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setJuniors(d); });
  }, []);

  const submit = async (acknowledgeExtra = false) => {
    if (!form.topic.trim()) { setError("Topic is required"); return; }
    if (!form.creativeTypeId) { setError("Pick a creative type"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(item ? `/api/content-items/${item.id}` : "/api/content-items", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, clientId, projectId, cycleId, acknowledgeExtra }),
      });
      const data = await res.json();
      if (res.status === 409 && data.needsExtraConfirmation) {
        setExtraPrompt(data.quota);
        return;
      }
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      toast.success(item ? "Content updated" : "Content planned");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {item ? "Edit content" : "Add content"}
          </h3>
        </div>

        <div className="p-5 space-y-4">
          {/* Quota-full confirmation — the SMM decides, having been told */}
          {extraPrompt && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  This quota is full ({extraPrompt.used}/{extraPrompt.quota}) — adding another
                  makes it an <strong>extra</strong>, flagged for your manager to price.
                </span>
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setExtraPrompt(null); submit(true); }}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-500">
                  Add as extra
                </button>
                <button onClick={() => setExtraPrompt(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Creative type *</label>
              <Select
                value={form.creativeTypeId}
                onChange={(v) => setForm((f) => ({ ...f, creativeTypeId: v }))}
                options={[{ value: "", label: "Pick a type…" }, ...types.map((t) => ({ value: t.id, label: String(`${t.icon ? `${t.icon} ` : ""}${t.name}`) }))]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Topic *</label>
            <input value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. Diwali teaser"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Brief</label>
            <textarea value={form.description} rows={3}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What should this say, look like, reference…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reference</label>
            <input type="url" value={form.referenceUrl}
              onChange={(e) => setForm((f) => ({ ...f, referenceUrl: e.target.value }))}
              placeholder="https://…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* The inline assign — planning and delegating in one action */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Assign to <span className="font-normal text-gray-400">— optional, can be done later</span>
            </label>
            <Select
              value={form.assigneeId}
              onChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))}
              options={[{ value: "", label: "Nobody yet" }, ...juniors.map((u) => ({ value: u.id, label: String(`${u.name}${u.jobTitle?.name ? ` — ${u.jobTitle.name}` : ""}`) }))]}
            />
          </div>

          {/* Only worth asking once there's somebody to ask it of. */}
          {form.assigneeId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Deadline for the editor
              </label>
              <input
                type="datetime-local"
                value={form.taskDueAt}
                onChange={(e) => setForm((f) => ({ ...f, taskDueAt: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                When you need the work in hand — separate from{" "}
                {new Date(form.date + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" })}, when it goes out.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => submit(false)}>
            {item ? "Save" : "Add content"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Bulk planning — lay out N items on a cadence, fill in later.
   ───────────────────────────────────────────────────────────── */
function BulkPlanDialog({
  projectId, cycleStart, types, onClose, onSaved,
}: {
  projectId: string;
  cycleStart: Date;
  types: { id: string; name: string; icon: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    creativeTypeId: types[0]?.id ?? "",
    count: "15",
    intervalDays: "2",
    startDate: cycleStart.toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creativeTypeId: form.creativeTypeId,
          count: Number(form.count),
          intervalDays: Number(form.intervalDays),
          startDate: form.startDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      toast.success(data.message);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Add multiple</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Lay out the slots now and fill in each topic as you go.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Creative type</label>
            <Select
              value={form.creativeTypeId}
              onChange={(v) => setForm((f) => ({ ...f, creativeTypeId: v }))}
              options={[...types.map((t) => ({ value: t.id, label: String(`${t.icon ? `${t.icon} ` : ""}${t.name}`) }))]}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">How many</label>
              <input type="number" min="1" max="60" value={form.count}
                onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Every</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min="1" value={form.intervalDays}
                  onChange={(e) => setForm((f) => ({ ...f, intervalDays: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="text-xs text-gray-400">days</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">From</label>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={submit}>Create slots</Button>
        </div>
      </div>
    </div>
  );
}
