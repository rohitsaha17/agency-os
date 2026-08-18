"use client";

import { useState, useEffect } from "react";
import { Gauge } from "lucide-react";

/**
 * Phase 6: one-line package fulfillment for the current month on the client
 * Overview — "Aug: 2/12 posts · 1/4 reels · 1/1 shoot · 2 extra".
 * Members see counts; billing never appears here.
 */
export function FulfillmentLine({ clientId }: { clientId: string }) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    fetch(`/api/clients/${clientId}/month-summary?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        const rows = s.perType.filter((r: { quota: number }) => r.quota > 0);
        if (rows.length === 0) return;
        const monthName = new Date().toLocaleDateString("en-US", { month: "short" });
        const parts = rows.map((r: { planned: number; posted: number; quota: number; creativeType: { name: string } }) =>
          `${r.planned + r.posted}/${r.quota} ${r.creativeType.name.toLowerCase()}${r.quota !== 1 ? "s" : ""}`);
        const extra = s.totals.extra > 0 ? ` · ${s.totals.extra} extra` : "";
        setLine(`${monthName}: ${parts.join(" · ")}${extra}`);
      })
      .catch(() => {});
  }, [clientId]);

  if (!line) return null;
  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
      <Gauge className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
      <span className="text-xs font-medium text-indigo-800">{line}</span>
    </div>
  );
}
