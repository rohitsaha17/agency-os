"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BarChart3, Download, ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface MissedRow {
  kind: "task" | "content";
  id: string;
  title: string;
  client: string;
  assignee: string;
  dueDate: string;
  daysLate: number;
  status: string;
  link: string;
}

export default function ReportsPage() {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [rows, setRows] = useState<MissedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [clientId, setClientId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const allowed = currentUser && ["ADMIN", "OWNER", "MANAGER"].includes(currentUser.role);

  useEffect(() => {
    if (!allowed) return;
    fetch("/api/clients").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setClients(d); });
    fetch("/api/users").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setUsers(d); });
  }, [allowed]);

  const fetchRows = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (clientId) params.set("clientId", clientId);
      if (assigneeId) params.set("assigneeId", assigneeId);
      const res = await fetch(`/api/reports/missed?${params}`);
      const d = await res.json();
      if (res.ok) setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }, [allowed, month, clientId, assigneeId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const exportCsv = () => {
    const header = ["Item", "Kind", "Client", "Assignee", "Due date", "Days late", "Status"];
    const lines = rows.map((r) => [
      `"${r.title.replace(/"/g, '""')}"`, r.kind, `"${r.client}"`, `"${r.assignee}"`,
      r.dueDate.slice(0, 10), r.daysLate, r.status,
    ].join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `missed-deadlines${month ? `-${month}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!userLoading && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ShieldAlert className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-sm font-medium text-gray-700">Reports are available to managers and admins.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" /> Reports
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Missed &amp; crossed deadlines across tasks and content</p>
          </div>
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
            <option value="">All Clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 min-w-[130px]">
            <option value="">All Assignees</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {(month || clientId || assigneeId) && (
            <button onClick={() => { setMonth(""); setClientId(""); setAssigneeId(""); }}
              className="text-xs text-gray-500 hover:text-red-600">Clear</button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-11 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="w-12 h-12 text-emerald-300 mb-4" />
            <p className="text-sm font-medium text-gray-700">Nothing missed — the team is on track. 🎉</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Item", "Client", "Assignee", "Due date", "Days late", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={r.link} className="font-medium text-gray-900 hover:text-indigo-600">
                        {r.title}
                      </Link>
                      <span className={`ml-2 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                        r.kind === "content" ? "bg-fuchsia-50 text-fuchsia-600" : "bg-indigo-50 text-indigo-600"
                      }`}>{r.kind}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.client}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.assignee}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(r.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${r.daysLate > 14 ? "text-red-600" : r.daysLate > 7 ? "text-orange-600" : "text-amber-600"}`}>
                        {r.daysLate}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.status.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
