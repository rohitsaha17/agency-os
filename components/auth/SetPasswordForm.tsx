"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ArrowRight, Check } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

/**
 * First-time password setup for a signed-in user (post-onboarding, or a
 * legacy account prompted on its next visit). Calls the session-based
 * /api/auth/set-password and continues into the app.
 */
export function SetPasswordForm({ name }: { name?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not set password");
      }
      router.push(data.needsOnboarding ? "/onboarding" : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 text-white mb-8">
          <BrandLogo className="w-9 h-9" />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Vibrnd</p>
            <p className="text-[10px] font-medium tracking-[0.25em] uppercase text-slate-400">Studio Flow</p>
          </div>
        </div>

        <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-500/15 mb-4">
          <Lock className="w-5 h-5 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Secure your account{name ? `, ${name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Set a password you&apos;ll use to sign in from now on. Minimum 8 characters.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
            <input
              type="password" required autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
            <input
              type="password" required value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>Set password &amp; continue <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          You can change this anytime from Settings.
        </p>
      </div>
    </div>
  );
}
