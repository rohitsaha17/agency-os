"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Plus, Loader2, KeyRound, RefreshCw, CheckCircle2,
  Clock, Users, FolderKanban, Receipt, LogOut, Copy,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

interface Tenant {
  id: string;
  name: string;
  email: string | null;
  onboardingCompleted: boolean;
  onboardedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string; email: string } | null;
  counts: { users: number; clients: number; projects: number; invoices: number };
}

const KEY_STORAGE = "vsf_platform_admin_key";

export default function PlatformAdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ org: string; email: string } | null>(null);
  const [form, setForm] = useState({ organizationName: "", ownerName: "", ownerEmail: "" });

  // Restore key from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE);
    if (stored) setAdminKey(stored);
  }, []);

  const fetchTenants = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants", {
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : data?.error?.message;
        throw new Error(msg || "Failed to load tenants");
      }
      setTenants(data);
      sessionStorage.setItem(KEY_STORAGE, key);
      setAdminKey(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setError(msg);
      if (msg.toLowerCase().includes("invalid admin key")) {
        sessionStorage.removeItem(KEY_STORAGE);
        setAdminKey(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) fetchTenants(adminKey);
  }, [adminKey, fetchTenants]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey) return;
    setCreating(true);
    setError(null);
    setCreatedInfo(null);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : data?.error?.message;
        throw new Error(msg || "Failed to create tenant");
      }
      setCreatedInfo({ org: data.name, email: data.owner.email });
      setForm({ organizationName: "", ownerName: "", ownerEmail: "" });
      fetchTenants(adminKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  };

  /* ── Key gate ─────────────────────────────────────────────── */
  if (!adminKey) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 text-white mb-8 justify-center">
            <BrandLogo className="w-9 h-9" />
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight">Vibrnd</p>
              <p className="text-[9px] font-medium tracking-[0.25em] uppercase text-slate-400">Platform Admin</p>
            </div>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) fetchTenants(keyInput.trim()); }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="w-4 h-4 text-indigo-400" /> Admin key
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
            )}
            <input
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="PLATFORM_ADMIN_KEY"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !keyInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Admin console ────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3 text-white">
            <BrandLogo className="w-8 h-8" />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight">Vibrnd Studio Flow</p>
              <p className="text-[9px] font-medium tracking-[0.25em] uppercase text-slate-400">Platform Admin · Tenants</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adminKey && fetchTenants(adminKey)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => { sessionStorage.removeItem(KEY_STORAGE); setAdminKey(null); setKeyInput(""); }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
              title="Lock"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-6 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">{error}</p>
        )}

        {/* Create tenant */}
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 mb-10">
          <div className="flex items-center gap-2 mb-5">
            <Plus className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">Create a new agency workspace</h2>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text" required placeholder="Agency name"
              value={form.organizationName}
              onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
              className="px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text" required placeholder="Owner full name"
              value={form.ownerName}
              onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
              className="px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email" required placeholder="Owner email"
              value={form.ownerEmail}
              onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
              className="px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="sm:col-span-3 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create workspace + owner</>}
            </button>
          </form>

          {createdInfo && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-emerald-200 leading-relaxed">
                <span className="font-semibold">{createdInfo.org}</span> is live.
                Tell the owner to sign in at <span className="font-mono">/login</span> with{" "}
                <span className="font-mono">{createdInfo.email}</span> — they&rsquo;ll be
                walked through onboarding on first login.
                <button
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/login — sign in with ${createdInfo.email}`)}
                  className="ml-2 inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-100 underline"
                >
                  <Copy className="w-3 h-3" /> copy invite
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Tenant list */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Workspaces</h2>
            <span className="text-xs text-slate-500">({tenants.length})</span>
          </div>

          {loading && tenants.length === 0 ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-2xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center text-sm text-slate-500">
              No workspaces yet — create the first one above.
            </div>
          ) : (
            <div className="space-y-2">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                      {t.onboardingCompleted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Onboarded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
                          <Clock className="w-2.5 h-2.5" /> Pending onboarding
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Owner: {t.owner ? `${t.owner.name} · ${t.owner.email}` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5" title="Users">
                      <Users className="w-3.5 h-3.5 text-slate-500" /> {t.counts.users}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Clients">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" /> {t.counts.clients}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Projects">
                      <FolderKanban className="w-3.5 h-3.5 text-slate-500" /> {t.counts.projects}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Invoices">
                      <Receipt className="w-3.5 h-3.5 text-slate-500" /> {t.counts.invoices}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
