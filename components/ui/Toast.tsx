"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Visual config ────────────────────────────────────────────────────────────

const CONFIG: Record<ToastType, { icon: React.ReactNode; bar: string; bg: string; iconBg: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    bar:    "bg-emerald-500",
    bg:     "bg-white",
    iconBg: "bg-emerald-50",
  },
  error: {
    icon: <XCircle className="w-4 h-4 text-red-600" />,
    bar:    "bg-red-500",
    bg:     "bg-white",
    iconBg: "bg-red-50",
  },
  warning: {
    icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
    bar:    "bg-amber-400",
    bg:     "bg-white",
    iconBg: "bg-amber-50",
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-600" />,
    bar:    "bg-blue-500",
    bg:     "bg-white",
    iconBg: "bg-blue-50",
  },
};

// ─── Container + individual toast ─────────────────────────────────────────────

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="assertive"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none"
      style={{ maxWidth: "min(360px, calc(100vw - 40px))" }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  const cfg = CONFIG[t.type];
  return (
    <div
      className={`
        ${cfg.bg} pointer-events-auto rounded-xl shadow-lg ring-1 ring-black/[0.06]
        flex overflow-hidden w-full
        animate-in slide-in-from-bottom-2 fade-in duration-300
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
        <p className="text-sm font-semibold text-gray-900 leading-snug">{t.title}</p>
        {t.message && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.message}</p>
        )}
      </div>
      {/* Close */}
      <button
        onClick={() => dismiss(t.id)}
        className="self-start p-2 m-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
