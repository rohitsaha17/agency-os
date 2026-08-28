"use client";

/**
 * Answering an assignment, from wherever you happened to see it.
 *
 * The accept prompt used to live only inside the task panel. That was fine
 * until a PLANNING task — which opens the project's plan page directly rather
 * than a panel — showed an "Accept?" badge with nowhere to press. The question
 * was asked in one place and could only be answered in another.
 *
 * So it is a dialog, openable with nothing but a task id: from a row badge, a
 * notification, or the panel. `onDone` fires after a successful answer, which
 * is where the caller sends you on to the actual work — accepting and then
 * having to find the task again is the same failure in a smaller form.
 */

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MIN_DECLINE_REASON, MAX_DECLINE_REASON } from "@/lib/task-acceptance";

interface Props {
  taskId: string;
  taskTitle?: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful answer, with what was chosen. */
  onDone?: (action: "ACCEPT" | "DECLINE") => void;
}

export function AcceptDeclineDialog({ taskId, taskTitle, open, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setDeclining(false);
      setReason("");
      onClose();
      onDone?.(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const reasonOk = reason.trim().length >= MIN_DECLINE_REASON
    && reason.trim().length <= MAX_DECLINE_REASON;

  return (
    <Modal
      open={open}
      onClose={() => { setDeclining(false); setError(null); onClose(); }}
      title={declining ? "Why can't you take this on?" : "This has been assigned to you"}
      width="max-w-md"
      footer={
        declining ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)} disabled={busy}>Back</Button>
            <Button onClick={() => respond("DECLINE")} loading={busy} disabled={!reasonOk}>Send</Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclining(true)} disabled={busy} icon={<X className="w-3.5 h-3.5" />}>
              Not available
            </Button>
            <Button onClick={() => respond("ACCEPT")} loading={busy} icon={<Check className="w-3.5 h-3.5" />}>
              Accept
            </Button>
          </div>
        )
      }
    >
      {declining ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-slate-400">
            This goes to whoever assigned it, so they can move the work or move
            the date. A sentence is plenty.
          </p>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_DECLINE_REASON}
            placeholder="On leave until the 4th · already on a shoot that day · this needs a photographer"
            className="w-full min-w-0 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/[0.08] rounded-lg text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">
              {reason.trim().length < MIN_DECLINE_REASON ? "A few words at least" : ""}
            </span>
            <span className="text-[11px] text-gray-400">{reason.length}/{MAX_DECLINE_REASON}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {taskTitle && (
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{taskTitle}</p>
          )}
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Take it on and you&rsquo;ll go straight to the work. If you can&rsquo;t,
            say so and whoever assigned it can give it to someone else.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </Modal>
  );
}
