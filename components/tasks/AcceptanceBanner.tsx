"use client";

/**
 * Accept the work, or say you can't take it.
 *
 * Shown to the person the task was handed to, above everything else, because
 * until it is answered nothing else on the task is really theirs to do.
 *
 * The assigner's side of the same thing is here too: once somebody has
 * declined, whoever handed it over sees the reason where the task lives
 * rather than only in a notification they may have already swiped away.
 */

import { useState } from "react";
import { Check, X, AlertCircle, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MIN_DECLINE_REASON, MAX_DECLINE_REASON } from "@/lib/task-acceptance";
import type { TaskAssignee } from "@/types";

interface Props {
  taskId: string;
  assignees: TaskAssignee[];
  currentUserId: string | undefined;
  /** Can this viewer hand the work to someone else? */
  canReassign?: boolean;
  onReassign?: () => void;
  /** Handed the refreshed assignee rows, so the caller can merge them in. */
  onChanged: (assignees: TaskAssignee[]) => void;
}

export function AcceptanceBanner({
  taskId, assignees, currentUserId, canReassign, onReassign, onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mine = assignees.find((a) => (a.user?.id ?? a.userId) === currentUserId);
  // Assignments made before acceptance existed have no state. Treating those
  // as pending would ask hundreds of people to re-accept work already under
  // way, so absent means settled.
  const myState = mine?.acceptance ?? "ACCEPTED";

  const declined = assignees.filter((a) => a.acceptance === "DECLINED");

  async function respond(action: "ACCEPT" | "DECLINE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/acceptance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "DECLINE" ? reason : undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Could not save that");
      }
      const updated = await res.json().catch(() => null);
      setDeclining(false);
      setReason("");
      onChanged(updated?.assignees ?? assignees);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const reasonOk = reason.trim().length >= MIN_DECLINE_REASON
    && reason.trim().length <= MAX_DECLINE_REASON;

  return (
    <>
      {/* Waiting on this person's answer. */}
      {mine && myState === "PENDING" && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 p-4 mb-4">
          <div className="flex items-start gap-2.5 mb-3">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                This has been assigned to you
              </p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300/80 mt-0.5">
                Take it on, or say you can&rsquo;t so it can go to someone else.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" onClick={() => respond("ACCEPT")} loading={busy} icon={<Check className="w-3.5 h-3.5" />}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeclining(true)} disabled={busy} icon={<X className="w-3.5 h-3.5" />}>
              Not available
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
        </div>
      )}

      {/* Your own decline, so it doesn't look like nothing happened. */}
      {mine && myState === "DECLINED" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 mb-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                You said you can&rsquo;t take this on
              </p>
              {mine.declineReason && (
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">&ldquo;{mine.declineReason}&rdquo;</p>
              )}
              <p className="text-xs text-amber-700 dark:text-amber-300/70 mt-1">
                Whoever assigned it has been told. They can hand it to someone else, or back to you.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Somebody else declined — the assigner's side. */}
      {declined.filter((a) => (a.user?.id ?? a.userId) !== currentUserId).map((a) => (
        <div key={a.userId} className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 mb-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {a.user?.name ?? "They"} can&rsquo;t take this on
              </p>
              {a.declineReason && (
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">&ldquo;{a.declineReason}&rdquo;</p>
              )}
              {canReassign && onReassign && (
                <button
                  onClick={onReassign}
                  className="mt-2.5 text-xs font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:no-underline"
                >
                  Assign it to someone else
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <Modal
        open={declining}
        onClose={() => setDeclining(false)}
        title="Why can't you take this on?"
        width="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => respond("DECLINE")} loading={busy} disabled={!reasonOk}>
              Send
            </Button>
          </div>
        }
      >
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
          This goes to whoever assigned it, so they can move the work or move the
          date. A sentence is plenty.
        </p>
        <textarea
          autoFocus
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DECLINE_REASON}
          placeholder="On leave until the 4th · already on the Smokzy shoot that day · this needs a photographer"
          className="w-full min-w-0 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-gray-400">
            {reason.trim().length < MIN_DECLINE_REASON ? "A few words at least" : ""}
          </span>
          <span className="text-[11px] text-gray-400">{reason.length}/{MAX_DECLINE_REASON}</span>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
      </Modal>
    </>
  );
}
