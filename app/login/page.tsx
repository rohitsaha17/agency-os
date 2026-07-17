"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Loader2, Users, FolderKanban, FileText,
  Receipt, HardDrive, MessageSquare,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

const FEATURES = [
  { icon: Users,         label: "Client CRM",          desc: "Contacts, brand assets, tax info" },
  { icon: FolderKanban,  label: "Projects & Tasks",    desc: "Kanban, lists, hierarchies" },
  { icon: FileText,      label: "Quotes → Invoices",   desc: "One flow from proposal to payment" },
  { icon: Receipt,       label: "Expenses & Receipts", desc: "Track every rupee in and out" },
  { icon: HardDrive,     label: "Files & Reviews",     desc: "Frame.io-style asset approval" },
  { icon: MessageSquare, label: "Team Chat",           desc: "Per-project and per-client channels" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : data?.error?.message;
        throw new Error(msg || "Login failed");
      }
      router.push(data.needsOnboarding ? "/onboarding" : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* ── Left: hero ── */}
      <div className="relative flex-1 flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden">
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-purple-600/10 blur-[120px]" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3 text-white">
            <BrandLogo className="w-10 h-10" />
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-tight">Vibrnd</p>
              <p className="text-[10px] font-medium tracking-[0.25em] uppercase text-slate-400">
                Studio Flow
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-xl py-14 lg:py-0">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Run your agency
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              on one flow.
            </span>
          </h1>
          <p className="mt-5 text-slate-400 text-lg leading-relaxed">
            Clients, projects, tasks, quotes, invoices, receipts, files and
            team chat — connected end to end, built for creative studios.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
              >
                <Icon className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-600">
          © {new Date().getFullYear()} Vibrnd · Studio Flow
        </p>
      </div>

      {/* ── Right: login card ── */}
      <div className="flex items-center justify-center p-8 sm:p-12 lg:w-[480px] lg:border-l lg:border-white/[0.06] bg-slate-900/40">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-400">
            Sign in with the email your workspace was set up with.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@youragency.com"
                className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-xs text-slate-500 leading-relaxed">
            New agency? Workspaces are created by the Vibrnd team — once
            yours is set up, sign in here with your owner email to complete
            onboarding.
          </p>
        </div>
      </div>
    </div>
  );
}
