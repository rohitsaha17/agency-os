"use client";

/**
 * v3 Phase 5 — the round trail for one task.
 *
 * Round 1 submitted → changes requested → Round 2 submitted → approved, each
 * with who and when. This is the accountability the whole loop exists to
 * produce, so it reads as a conversation rather than a log table.
 */

import { useEffect, useState } from "react";
import { Link2, Paperclip, CheckCircle2, RotateCcw, Clock } from "lucide-react";

interface Round {
  revision: number;
  submission: {
    id: string; method: string; url: string | null; note: string | null;
    deliveredAt: string;
    deliveredBy: { id: string; name: string } | null;
    file: { id: string; name: string; url: string } | null;
  } | null;
  review: {
    id: string; decision: "APPROVED" | "CHANGES_REQUESTED";
    comments: string | null; reviewedAt: string;
    reviewedBy: { id: string; name: string } | null;
  } | null;
}

const METHOD_LABEL: Record<string, string> = {
  LINK: "a link",
  FILE_UPLOAD: "an upload",
  WHATSAPP: "WhatsApp",
  SLACK: "Slack",
  OTHER: "another route",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function RoundHistory({ taskId }: { taskId: string }) {
  const [rounds, setRounds] = useState<Round[] | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/review`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRounds(d?.rounds ?? []))
      .catch(() => setRounds([]));
  }, [taskId]);

  if (rounds === null) {
    return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>;
  }
  if (rounds.length === 0) {
    return <p className="text-xs text-gray-400 py-4">Not submitted yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rounds.map((r) => (
        <div key={r.revision} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
            <span className="text-[11px] font-semibold text-gray-600">Round {r.revision}</span>
          </div>

          <div className="p-3 space-y-2.5 text-xs">
            {r.submission ? (
              <div className="flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-gray-600">
                    <span className="font-medium text-gray-800">
                      {r.submission.deliveredBy?.name ?? "Someone"}
                    </span>
                    {" submitted via "}{METHOD_LABEL[r.submission.method] ?? r.submission.method.toLowerCase()}
                    <span className="text-gray-400"> · {when(r.submission.deliveredAt)}</span>
                  </p>
                  {r.submission.note && (
                    <p className="text-gray-700 mt-1 italic">{r.submission.note}</p>
                  )}
                  {r.submission.url && (
                    <a href={r.submission.url} target="_blank" rel="noreferrer"
                      className="text-indigo-600 hover:underline break-all inline-flex items-center gap-1 mt-1">
                      <Link2 className="w-3 h-3 flex-shrink-0" /> {r.submission.url}
                    </a>
                  )}
                  {r.submission.file && (
                    <a href={r.submission.file.url} target="_blank" rel="noreferrer"
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1 mt-1">
                      <Paperclip className="w-3 h-3" /> {r.submission.file.name}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Waiting to be submitted.</p>
            )}

            {r.review && (
              <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
                {r.review.decision === "APPROVED" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-gray-600">
                    <span className="font-medium text-gray-800">
                      {r.review.reviewedBy?.name ?? "Someone"}
                    </span>
                    {r.review.decision === "APPROVED" ? " approved" : " asked for changes"}
                    <span className="text-gray-400"> · {when(r.review.reviewedAt)}</span>
                  </p>
                  {r.review.comments && (
                    <p className="text-gray-700 mt-1 italic">{r.review.comments}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
