"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Link2, MessageSquare, ShieldAlert } from "lucide-react";

interface ReviewItem {
  id: string;
  topic: string;
  description: string | null;
  referenceUrl: string | null;
  date: string;
  status: string;
  creativeType: { name: string; icon: string | null; color: string | null };
}

interface ReviewData {
  clientName: string;
  clientLogoUrl: string | null;
  orgName: string;
  accent: string;
  items: ReviewItem[];
}

const STATUS_LABEL: Record<string, string> = {
  TEAM_APPROVED: "Awaiting your approval",
  CLIENT_APPROVED: "Approved by you",
  SCHEDULED: "Scheduled",
  POSTED: "Posted",
  IN_PROGRESS: "Being reworked",
};

export default function PublicReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [changesFor, setChangesFor] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/review/${token}`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "This review link is not available.");
        return;
      }
      setData(d);
    } catch {
      setError("Something went wrong loading this review.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (itemId: string, action: "approve" | "request_changes") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action, comment: action === "request_changes" ? comment : undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error?.message ?? "That didn't work — please try again.");
        return;
      }
      setChangesFor(null);
      setComment("");
      fetchData();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center max-w-sm shadow-sm">
          <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-800 mb-1">This link isn&apos;t available</p>
          <p className="text-xs text-gray-500">{error ?? "The review link may have expired — ask your agency for a fresh one."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Branded header */}
      <div className="text-white px-6 py-8" style={{ backgroundColor: data.accent }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {data.clientLogoUrl ? (
            <div className="w-14 h-14 rounded-xl bg-white p-1.5 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.clientLogoUrl} alt={data.clientName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">
              {data.clientName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold">{data.clientName} — Content Review</h1>
            <p className="text-xs opacity-80 mt-0.5">Prepared by {data.orgName}. Approve each item or request changes below.</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 -mt-4 space-y-4">
        {data.items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
            <p className="text-sm text-gray-500">Nothing awaiting review right now.</p>
          </div>
        ) : (
          data.items.map((item) => {
            const approved = item.status === "CLIENT_APPROVED" || item.status === "SCHEDULED" || item.status === "POSTED";
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{item.creativeType.icon ?? "✨"}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {item.creativeType.name} · {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        approved ? "bg-emerald-50 text-emerald-700" : item.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
                      }`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </div>
                    <h2 className="text-sm font-semibold text-gray-900">{item.topic}</h2>
                    {item.description && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p>}
                    {item.referenceUrl && (
                      <a href={item.referenceUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs mt-2 underline underline-offset-2 break-all"
                        style={{ color: data.accent }}>
                        <Link2 className="w-3 h-3" /> View reference
                      </a>
                    )}
                  </div>
                </div>

                {!approved && item.status === "TEAM_APPROVED" && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    {changesFor === item.id ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus value={comment} rows={2}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Tell us what you'd like changed…"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => act(item.id, "request_changes")} disabled={busy || !comment.trim()}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                            Send change request
                          </button>
                          <button onClick={() => { setChangesFor(null); setComment(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => act(item.id, "approve")} disabled={busy}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                          style={{ backgroundColor: data.accent }}>
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button onClick={() => setChangesFor(item.id)} disabled={busy}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          <MessageSquare className="w-4 h-4" /> Request changes
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {approved && (
                  <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved — thank you!
                  </p>
                )}
              </div>
            );
          })
        )}

        <p className="text-center text-[11px] text-gray-400 pt-4">
          Powered by {data.orgName} · Studio Flow
        </p>
      </div>
    </div>
  );
}
