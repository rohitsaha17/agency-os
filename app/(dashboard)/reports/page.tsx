"use client";

/**
 * v3 Phase 8 — reports, gated by the same capabilities as everything else.
 *
 * Five reports, and which you can open follows the matrix rather than a
 * hardcoded role list (docs/V3_CONTEXT.md §8). An SMM holds reports.delivery
 * but sees only their own projects, which the API scopes rather than the UI
 * filtering afterwards.
 */

import { useState, useEffect, useCallback } from "react";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import { RequireCapability } from "@/components/layout/RequireCapability";

type Row = Record<string, string | number | null>;

const REPORTS: { id: string; label: string; hint: string; needsAll?: boolean }[] = [
  { id: "delivery",  label: "Delivery",         hint: "Quota against what actually went out, per cycle" },
  { id: "deadline",  label: "Deadlines",        hint: "What's late, by how long, and whose it is" },
  { id: "workload",  label: "Team workload",    hint: "Open, submitted and overdue per person" },
  { id: "cycles",    label: "Cycle history",    hint: "Every close: what carried, what billed" },
  // Only reports.all reaches this one — the API refuses it too.
  { id: "financial", label: "Revenue & margin", hint: "Invoiced, collected and spent per client", needsAll: true },
];

export default function ReportsPage() {
  return (
    <RequireCapability capability="reports.delivery" what="Reports">
      <ReportsPageInner />
    </RequireCapability>
  );
}

function ReportsPageInner() {
  const { user } = useCurrentUser();
  const [report, setReport] = useState<string>("delivery");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoped, setScoped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seesFinancials = can(user, "reports.all");
  const available = REPORTS.filter((r) => !r.needsAll || seesFinancials);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/reports/v3?report=${report}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error?.message ?? "Couldn't load that report"); setRows([]); return; }
      setRows(d.rows);
      setScoped(d.scoped);
    } finally { setLoading(false); }
  }, [report]);

  useEffect(() => { load(); }, [load]);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const current = REPORTS.find((r) => r.id === report);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" /> Reports
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {current?.hint}
              {scoped && <span className="text-gray-400"> · your projects only</span>}
            </p>
          </div>
          <a
            href={`/api/reports/v3?report=${report}&format=csv`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>
        </div>

        <div className="flex gap-1.5 mt-4 flex-wrap">
          {available.map((r) => (
            <button key={r.id} onClick={() => setReport(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                report === r.id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-10">{error}</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <BarChart3 className="w-9 h-9 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">Nothing to report yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {report === "cycles"
                ? "Closing a cycle is what fills this in."
                : "This fills in as work moves through the system."}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {headers.map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {/* CamelCase headers read better with spaces */}
                      {h.replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 ? "bg-gray-50/40" : ""}`}>
                    {headers.map((h) => (
                      <td key={h} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {r[h] ?? "—"}
                      </td>
                    ))}
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
