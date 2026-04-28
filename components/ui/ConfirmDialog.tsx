"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "./Button";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface DialogState extends ConfirmOptions {
  resolve: (val: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const handleResolve = (val: boolean) => {
    dialog?.resolve(val);
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel ?? "Confirm"}
          cancelLabel={dialog.cancelLabel ?? "Cancel"}
          variant={dialog.variant ?? "danger"}
          onConfirm={() => handleResolve(true)}
          onCancel={() => handleResolve(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// ─── Dialog UI ────────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ConfirmVariant, {
  iconBg: string;
  icon: React.ReactNode;
  confirmVariant: "danger" | "primary";
}> = {
  danger: {
    iconBg: "bg-red-50",
    icon: <Trash2 className="w-5 h-5 text-red-600" />,
    confirmVariant: "danger",
  },
  warning: {
    iconBg: "bg-amber-50",
    icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    confirmVariant: "primary",
  },
  info: {
    iconBg: "bg-blue-50",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-600" />,
    confirmVariant: "primary",
  },
};

function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel,
}: {
  title: string; message: string;
  confirmLabel: string; cancelLabel: string;
  variant: ConfirmVariant;
  onConfirm: () => void; onCancel: () => void;
}) {
  const cfg = VARIANT_CONFIG[variant];

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm ring-1 ring-black/[0.06] p-6 animate-in zoom-in-95 fade-in duration-200">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${cfg.iconBg}`}>
          {cfg.icon}
        </div>
        {/* Text */}
        <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>
        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={cfg.confirmVariant}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
