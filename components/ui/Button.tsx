import { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-sm",
  secondary:
    "bg-white text-gray-700 hover:bg-gray-50 border-gray-300 shadow-sm dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-600",
  danger:
    "bg-red-600 text-white hover:bg-red-700 border-transparent shadow-sm",
  ghost:
    "bg-transparent text-gray-600 hover:bg-gray-100 border-transparent dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center gap-2 font-medium rounded-lg border
        transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}
      `}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
