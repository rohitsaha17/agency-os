"use client";

/**
 * A load that failed, said out loud.
 *
 * Both the calendar and the task board fetched with `if (res.ok) { … }` and no
 * else and no catch. When the request failed — a dropped connection, a 500,
 * a session that expired mid-session — the state simply stayed empty and the
 * loading flag went false, so the page rendered its EMPTY state: "Nothing
 * scheduled", "Nothing open".
 *
 * That is the worst way for a fetch to fail, because it looks like success.
 * Somebody opens their board on a bad connection and is told, with confidence,
 * that they have no work. They close the laptop.
 *
 * So a failure has to look different from an absence, and it has to offer the
 * one thing that usually fixes it.
 *
 * Deliberately built from this project's own primitives rather than installed
 * from a catalogue: the app has no shadcn layer, and adding one for a box with
 * a button in it would mean two design systems for the rest of its life.
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  /** What failed, in the user's terms — "Couldn't load your tasks". */
  message?: string;
  /** The underlying reason, when there is a useful one. */
  detail?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  /** Sits inside a panel rather than filling a page. */
  compact?: boolean;
}

export function LoadError({
  message = "Couldn't load this",
  detail,
  onRetry,
  retrying,
  compact,
}: Props) {
  return (
    <div
      // Announced when it replaces the loading state, so somebody using a
      // screen reader isn't left waiting for content that is never coming.
      role="alert"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8 px-4" : "py-16 px-6"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{message}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-xs">
        {detail
          ? detail
          : "This is a problem loading, not an empty list — your work is still there."}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onRetry}
          loading={retrying}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          className="mt-4"
        >
          Try again
        </Button>
      )}
    </div>
  );
}
