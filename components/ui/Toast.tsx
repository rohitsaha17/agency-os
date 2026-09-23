"use client";

import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (type: ToastType, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

/** How long a toast takes to leave. Must match the transition on the item. */
const EXIT_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  /*
    Toasts on their way out.

    Dismissing used to drop the row from the array, which unmounts it — so
    there was nothing left to animate and a toast blinked out of existence.
    Marking it first lets it travel back down through the bottom edge it came
    up from, and the row is removed once it has.

    The public API is unchanged: callers still just call dismiss(id).
  */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setLeaving((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_MS);
  }, []);

  const toast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => dismiss(id), type === "error" ? 6000 : 4000);
  }, [dismiss]);

  const success = useCallback((title: string, message?: string) => toast("success", title, message), [toast]);
  const error   = useCallback((title: string, message?: string) => toast("error",   title, message), [toast]);
  const warning = useCallback((title: string, message?: string) => toast("warning", title, message), [toast]);
  const info    = useCallback((title: string, message?: string) => toast("info",    title, message), [toast]);

  return (
    <ToastContext.Provider value={{ toasts, toast, success, error, warning, info, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} leaving={leaving} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Visual config ────────────────────────────────────────────────────────────

// `bg` carried a hardcoded bg-white, so in dark mode every toast was a white
// slab with near-white text on it — readable only by accident, from the icon.
const CONFIG: Record<ToastType, { icon: React.ReactNode; bar: string; bg: string; iconBg: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    bar:    "bg-emerald-500",
    bg:     "bg-white dark:bg-slate-800",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  error: {
    icon: <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />,
    bar:    "bg-red-500",
    bg:     "bg-white dark:bg-slate-800",
    iconBg: "bg-red-50 dark:bg-red-500/10",
  },
  warning: {
    icon: <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    bar:    "bg-amber-400",
    bg:     "bg-white dark:bg-slate-800",
    iconBg: "bg-amber-50 dark:bg-amber-500/10",
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
    bar:    "bg-blue-500",
    bg:     "bg-white dark:bg-slate-800",
    iconBg: "bg-blue-50 dark:bg-blue-500/10",
  },
};

// ─── Container + individual toast ─────────────────────────────────────────────

function ToastContainer({
  toasts, leaving, dismiss,
}: {
  toasts: Toast[]; leaving: Set<string>; dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    /*
      Across the bottom on a phone, clear of the home indicator.

      Pinned to the bottom-right corner it landed under the thumb that had
      just pressed something — the one place a confirmation should not be —
      and its dismiss button ended up at the furthest point on the screen
      from either thumb. On a desktop the corner is right, so that stays.
    */
    <div
      aria-live="assertive"
      className="fixed z-[9999] flex flex-col gap-2.5 pointer-events-none
        left-3 right-3 bottom-[calc(0.75rem+var(--safe-bottom))]
        sm:left-auto sm:right-5 sm:bottom-5 sm:w-[min(360px,calc(100vw-40px))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} leaving={leaving.has(t.id)} dismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast: t, leaving, dismiss,
}: {
  toast: Toast; leaving: boolean; dismiss: (id: string) => void;
}) {
  const cfg = CONFIG[t.type];

  // One frame at the closed position, then flip — otherwise the browser
  // computes a single style and the toast is simply already in place.
  //
  // A timer races the frame for the same reason as lib/usePresence: `shown`
  // gates opacity, so a tab that has stopped painting would otherwise leave
  // the toast permanently invisible. A confirmation nobody sees is worse than
  // one that arrives without sliding.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let done = false;
    const reveal = () => { if (!done) { done = true; setShown(true); } };
    const raf = requestAnimationFrame(reveal);
    const fallback = setTimeout(reveal, 32);
    return () => { cancelAnimationFrame(raf); clearTimeout(fallback); };
  }, []);

  /*
    A transition rather than keyframes, deliberately.

    Toasts are the one thing here that can be fired twice in a second — save,
    then save again. Keyframes restart from frame zero when re-triggered, so a
    toast landing mid-flight snaps back to the beginning; a transition
    retargets from wherever it currently is. It also gives the exit for free,
    which keyframes would need a second animation to do.

    It leaves through the bottom edge it came up from. An exit that retraces
    the entrance is what makes dismissing feel like putting something back
    rather than deleting it.
  */
  return (
    <div
      className={`
        ${cfg.bg} pointer-events-auto rounded-xl shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.08]
        flex overflow-hidden w-full will-change-[translate,opacity]
        [transition-property:translate,opacity] duration-[var(--motion-base)] ease-[var(--motion-ease)]
        ${shown && !leaving ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}
      `}
    >
      {/* Left accent bar */}
      <div className={`w-1 flex-shrink-0 ${cfg.bar}`} />
      {/* Icon */}
      <div className={`flex items-center justify-center p-3 ${cfg.iconBg}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${cfg.iconBg}`}>
          {cfg.icon}
        </div>
      </div>
      {/* Text */}
      <div className="flex-1 px-3 py-3 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-snug">{t.title}</p>
        {t.message && (
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t.message}</p>
        )}
      </div>
      {/* Close */}
      <button
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
        className="self-start p-2 m-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
