"use client";

import { useState, useEffect } from "react";
import { Clock, Plus, Timer } from "lucide-react";
import type { TimeEntry } from "@/types";

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

interface TimeTrackerProps {
  taskId: string;
  estimatedHours: number | null;
  loggedHours: number;
  onUpdate: (estimatedHours: number | null, loggedHours: number) => void;
}

export function TimeTracker({ taskId, estimatedHours, loggedHours: initLogged, onUpdate }: TimeTrackerProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [estimated, setEstimated] = useState(estimatedHours?.toString() ?? "");
  const [savingEst, setSavingEst] = useState(false);
  const [totalLogged, setTotalLogged] = useState(initLogged);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/time-entries`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setEntries(data); })
      .finally(() => setLoading(false));
  }, [taskId]);

  const handleSaveEstimate = async () => {
    setSavingEst(true);
    const val = estimated ? parseFloat(estimated) : null;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedHours: estimated || null }),
    });
    onUpdate(val, totalLogged);
    setSavingEst(false);
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hours || parseFloat(hours) <= 0) return;
    setLogging(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, date, notes }),
      });
      const data = await res.json();
      if (res.ok) {
        setEntries((prev) => [data, ...prev]);
        const newTotal = totalLogged + parseFloat(hours);
        setTotalLogged(newTotal);
        onUpdate(estimated ? parseFloat(estimated) : null, newTotal);
        setHours("");
        setNotes("");
        setShowLog(false);
      }
    } finally {
      setLogging(false);
    }
  };

  const pct = estimated && parseFloat(estimated) > 0
    ? Math.min(100, Math.round((totalLogged / parseFloat(estimated)) * 100))
    : null;

  const overBudget = pct !== null && pct > 100;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Estimated</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              onBlur={handleSaveEstimate}
              placeholder="—"
              className="w-full text-lg font-bold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
            />
            <span className="text-xs text-gray-400 flex-shrink-0">hrs</span>
          </div>
          {savingEst && <p className="text-xs text-indigo-500 mt-0.5">Saving…</p>}
        </div>
        <div className={`border rounded-xl p-3 ${overBudget ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <p className="text-xs text-gray-500 mb-1">Logged</p>
          <p className={`text-lg font-bold ${overBudget ? "text-red-700" : "text-gray-900"}`}>
            {formatHours(totalLogged)}
          </p>
          {pct !== null && (
            <p className={`text-xs mt-0.5 ${overBudget ? "text-red-500" : "text-gray-400"}`}>
              {pct}% of estimate
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Log time button */}
      <button
        onClick={() => setShowLog((v) => !v)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
      >
        <Plus className="w-4 h-4" /> Log Time
      </button>

      {/* Log form */}
      {showLog && (
        <form onSubmit={handleLogTime} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <input
                type="number" min="0.25" step="0.25"
                value={hours} onChange={(e) => setHours(e.target.value)}
                placeholder="1.5" autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you work on?"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowLog(false)} className="flex-1 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!hours || logging} className="flex-1 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {logging ? "Logging…" : "Log Time"}
            </button>
          </div>
        </form>
      )}

      {/* Entries */}
      {!loading && entries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">History</h4>
          <div className="space-y-1.5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-lg">
                <Timer className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800 w-12 flex-shrink-0">{formatHours(e.hours)}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                {e.notes && <span className="text-xs text-gray-500 truncate flex-1">{e.notes}</span>}
                {e.user && <span className="text-xs text-gray-400 flex-shrink-0">{e.user.name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!loading && entries.length === 0 && !showLog && (
        <div className="flex items-center gap-2 text-xs text-gray-400 justify-center py-3">
          <Clock className="w-4 h-4" /> No time logged yet
        </div>
      )}
    </div>
  );
}
