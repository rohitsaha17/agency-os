"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Select } from "@/components/ui/Select";

const TEAM_SIZES = ["1-5", "6-10", "11-25", "26-50", "50+"];

export default function RequestAccessPage() {
  const [form, setForm] = useState({
    agencyName: "", contactName: "", email: "", phone: "",
    location: "", website: "", teamSize: "", services: "", message: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.agencyName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setError("Please fill in your agency name, your name, and email.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/trial-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not submit your request");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 text-white mb-8">
          <BrandLogo className="w-9 h-9" />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Vibrnd</p>
            <p className="text-[10px] font-medium tracking-[0.25em] uppercase text-slate-400">Studio Flow</p>
          </div>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold tracking-tight">Request received</h1>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Thanks, {form.contactName.split(" ")[0] || "there"}. The Vibrnd team will review your
              details and reach out at <span className="text-slate-200">{form.email}</span> to set up
              your free trial workspace.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-700 text-slate-200 hover:bg-white/[0.05] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Start your free trial</h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Tell us about your agency and we&apos;ll set up a workspace for you. No card required.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Agency name *</label>
                  <input className={inputCls} value={form.agencyName} onChange={(e) => set("agencyName", e.target.value)} placeholder="Studio Vibrnd" autoFocus />
                </div>
                <div>
                  <label className={labelCls}>Your name *</label>
                  <input className={inputCls} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Rohit Saha" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Work email *</label>
                  <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@youragency.com" />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Where are you based?</label>
                  <input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Mumbai, India" />
                </div>
                <div>
                  <label className={labelCls}>Team size</label>
                  <Select
                    value={form.teamSize}
                    onChange={(v) => set("teamSize", v)}
                    options={[{ value: "", label: "Select…" }, ...TEAM_SIZES.map((s) => ({ value: s, label: String(`${s} people`) }))]}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Website</label>
                <input className={inputCls} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://youragency.com" />
              </div>

              <div>
                <label className={labelCls}>What does your agency do?</label>
                <textarea
                  className={`${inputCls} min-h-[84px] resize-y`} value={form.services}
                  onChange={(e) => set("services", e.target.value)}
                  placeholder="Branding, social media, video production, web design…"
                />
              </div>

              <div>
                <label className={labelCls}>Anything else? (optional)</label>
                <textarea
                  className={`${inputCls} min-h-[60px] resize-y`} value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Tell us what you're hoping to streamline."
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Request my free trial <ArrowRight className="w-4 h-4" /></>}
              </button>

              <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Already have a workspace? Sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
