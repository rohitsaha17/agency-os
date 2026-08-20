"use client";

import { useState, useEffect, useCallback } from "react";
import { PhoneCall, Plus, Check, Clock } from "lucide-react";
import { toast } from "@/lib/toast";
import { Select } from "@/components/ui/Select";

interface FollowUpRow {
  id: string;
  note: string;
  dueAt: string;
  status: "PENDING" | "SNOOZED";
  snoozedTo: string | null;
  assignedTo: { id: string; name: string };
}

/** Phase 8: POC/SME client follow-ups card on the client Overview. */
export function FollowUpsCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<FollowUpRow[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ note: "", dueAt: new Date().toISOString().slice(0, 10), assignedToId: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/follow-ups`);
    if (res.ok) setRows(await res.json());
  }, [clientId]);

  useEffect(() => {
    fetchRows();
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); });
  }, [fetchRows]);

  const add = async () => {
    if (!form.note.trim()) { toast.error("A note is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, assignedToId: form.assignedToId || undefined }),
      });
      if (res.ok) {
        setForm({ note: "", dueAt: new Date().toISOString().slice(0, 10), assignedToId: "" });
        setAdding(false);
        fetchRows();
      }
    } finally { setSaving(false); }
  };

  const act = async (followUpId: string, action: "done" | "snooze", days?: number) => {
    await fetch(`/api/clients/${clientId}/follow-ups`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpId, action, days }),
    });
    fetchRows();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Follow-ups</span>
        </div>
        <button onClick={() => setAdding((a) => !a)}
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-2">
          <input value={form.note} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. Ask about the Diwali campaign brief"
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex gap-2">
            <input type="date" value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white" />
            <Select
              value={form.assignedToId}
              onChange={(v) => setForm((f) => ({ ...f, assignedToId: v }))}
              options={[{ value: "", label: "Default (POC)" }, ...users.map((u) => ({ value: u.id, label: `${u.name}` }))]}
              size="sm"
            />
            <button onClick={add} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">No open follow-ups.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((f) => {
            const overdue = new Date(f.snoozedTo ?? f.dueAt) <= new Date();
            return (
              <li key={f.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overdue ? "bg-red-400" : "bg-amber-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700 truncate">{f.note}</p>
                  <p className="text-[10px] text-gray-400">
                    {f.assignedTo.name} · due {new Date(f.snoozedTo ?? f.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {f.status === "SNOOZED" && " (snoozed)"}
                  </p>
                </div>
                <button onClick={() => act(f.id, "done")} title="Done"
                  className="p-1 text-emerald-500 hover:bg-emerald-50 rounded">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <div className="relative group">
                  <button title="Snooze" className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute right-0 top-6 z-10 hidden group-hover:block bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[70px]">
                    {[["1d", 1], ["3d", 3], ["1w", 7]].map(([label, days]) => (
                      <button key={label as string} onClick={() => act(f.id, "snooze", days as number)}
                        className="block w-full text-left px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50">
                        {label as string}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
