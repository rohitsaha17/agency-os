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

type Phase = "email" | "password" | "setup";

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errMsg = (data: unknown) => {
    const e = (data as { error?: unknown })?.error;
    return typeof e === "string" ? e : (e as { message?: string })?.message;
  };

  const goNext = (needsOnboarding: boolean) => {
    router.push(needsOnboarding ? "/onboarding" : "/");
    router.refresh();
  };

  // Phase 1 — identify the account and branch to password / setup.
  const submitEmail = async (e: React.FormEvent) => {
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
      if (!res.ok) throw new Error(errMsg(data) || "Login failed");
      if (data.needsPasswordSetup) setPhase("setup");
      else setPhase("password");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  // Phase 2a — verify an existing password.
  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errMsg(data) || "Login failed");
      goNext(!!data.needsOnboarding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  // Phase 2b — set the initial password for a first-time / legacy account.
  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errMsg(data) || "Could not set password");
      goNext(!!data.needsOnboarding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const backToEmail = () => {
    setPhase("email");
    setPassword("");
    setConfirm("");
    setError(null);
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
          <h2 className="text-2xl font-bold tracking-tight">
            {phase === "setup" ? "Set your password" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {phase === "email" && "Sign in with the email your workspace was set up with."}
            {phase === "password" && (
              <>Signing in as <span className="text-slate-200 font-medium">{email}</span>.</>
            )}
            {phase === "setup" && (
              <>First time in? Create a password for <span className="text-slate-200 font-medium">{email}</span> to secure your account.</>
            )}
          </p>

          {error && (
            <p className="mt-5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}

          {/* Phase 1 — email */}
          {phase === "email" && (
            <form onSubmit={submitEmail} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Work email
                </label>
                <input
                  id="email" type="email" required autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@youragency.com"
                  className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* Phase 2a — existing password */}
          {phase === "password" && (
            <form onSubmit={submitPassword} className="mt-6 space-y-4">
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  id="password" type="password" required autoFocus value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={backToEmail} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Use a different email
              </button>
            </form>
          )}

          {/* Phase 2b — set initial password */}
          {phase === "setup" && (
            <form onSubmit={submitSetup} className="mt-6 space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                  New password
                </label>
                <input
                  id="new-password" type="password" required autoFocus value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirm-password" type="password" required value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Set password &amp; continue <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={backToEmail} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Use a different email
              </button>
            </form>
          )}

          {phase === "email" && (
            <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
              <p className="text-xs text-slate-500 leading-relaxed">
                New agency? Workspaces are created by the Vibrnd team — once
                yours is set up, sign in here with your owner email to complete
                onboarding.
              </p>
              <a
                href="/request-access"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Contact us to start a free trial <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
