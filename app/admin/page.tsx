"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Plus, Loader2, KeyRound, RefreshCw, CheckCircle2,
  Clock, Users, FolderKanban, Receipt, LogOut, Copy, Inbox, Mail, Gauge, Sparkles,
  ImageIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

/** Plan status pill: Full, active Trial (with days left), or Trial ended. */
function PlanBadge({ plan, trialEndsAt }: { plan: "TRIAL" | "FULL"; trialEndsAt: string | null }) {
  if (plan === "FULL") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
        <Sparkles className="w-2.5 h-2.5" /> Full access
      </span>
    );
  }
  const end = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
  const daysLeft = end ? Math.ceil((end - Date.now()) / 86_400_000) : null;
  const ended = end !== null && end < Date.now();
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ${
      ended ? "bg-red-500/15 text-red-300 ring-red-500/30" : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
    }`}>
      <Clock className="w-2.5 h-2.5" />
      {ended ? "Trial ended" : daysLeft !== null ? `Trial · ${daysLeft}d left` : "Trial"}
    </span>
  );
}

interface Tenant {
  id: string;
  name: string;
  email: string | null;
  onboardingCompleted: boolean;
  onboardedAt: string | null;
  createdAt: string;
  plan: "TRIAL" | "FULL";
  trialEndsAt: string | null;
  uploadLimitMb: number;
  /** Chrome carries this workspace's own logo instead of the Vibrnd mark. */
  whiteLabel: boolean;
  /** Whether they have actually uploaded one — the flag is moot without it. */
  hasLogo: boolean;
  storageUsedBytes: number;
  owner: { id: string; name: string; email: string } | null;
  counts: { users: number; clients: number; projects: number; invoices: number };
}

interface TrialRequest {
  id: string;
  agencyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  location: string | null;
  website: string | null;
  teamSize: string | null;
  services: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

const KEY_STORAGE = "vsf_platform_admin_key";

export default function PlatformAdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [requests, setRequests] = useState<TrialRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ org: string; email: string; setupUrl: string | null } | null>(null);
  const [form, setForm] = useState({ organizationName: "", ownerName: "", ownerEmail: "" });

  // Per-tenant owner-password reset
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ id: string; text: string } | null>(null);

  const resetOwnerPassword = useCallback(async (tenantId: string, clear: boolean) => {
    if (!adminKey) return;
    if (!clear && resetPw.length < 8) {
      setResetMsg({ id: tenantId, text: "Password must be at least 8 characters." });
      return;
    }
    setResetBusy(true);
    setResetMsg(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(clear ? {} : { newPassword: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Reset failed");
      setResetMsg({
        id: tenantId,
        text: data.mode === "set"
          ? `Password set for ${data.ownerEmail}. Share it with them securely.`
          : `Cleared. Send ${data.ownerEmail} this one-time setup link: ${window.location.origin}${data.setupPath}`,
      });
      setResetPw("");
      setResetFor(null);
    } catch (err) {
      setResetMsg({ id: tenantId, text: err instanceof Error ? err.message : "Reset failed" });
    } finally {
      setResetBusy(false);
    }
  }, [adminKey, resetPw]);

  // Per-tenant plan / trial / storage / branding management
  const [manageFor, setManageFor] = useState<string | null>(null);
  const [trialDaysInput, setTrialDaysInput] = useState("14");
  const [storageInput, setStorageInput] = useState("");
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [planMsg, setPlanMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  // The open panel's logo, fetched lazily. Keyed by tenant so switching
  // panels cannot show the previous workspace's mark for a frame.
  const [logoFor, setLogoFor] = useState<{ id: string; url: string | null } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");

  const loadLogo = useCallback(async (tenantId: string) => {
    if (!adminKey) return;
    setLogoFor(null);
    setLogoError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/logo`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (res.ok) setLogoFor({ id: tenantId, url: data.logoUrl ?? null });
    } catch {
      /* the panel simply shows no preview */
    }
  }, [adminKey]);

  const patchTenant = useCallback(async (tenantId: string, patch: Record<string, unknown>, okText: string) => {
    if (!adminKey) return;
    setPlanBusy(tenantId);
    setPlanMsg(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Update failed");
      // Spread the response rather than naming fields: the route returns the
      // whole updated row, and listing three of them meant a PATCH of anything
      // else blanked the other two in the table.
      setTenants((prev) => prev.map((t) => t.id === tenantId ? { ...t, ...data } : t));
      setPlanMsg({ id: tenantId, text: okText });
    } catch (err) {
      setPlanMsg({ id: tenantId, text: err instanceof Error ? err.message : "Update failed", error: true });
    } finally {
      setPlanBusy(null);
    }
  }, [adminKey]);

  /**
   * Put a logo on a workspace from here.
   *
   * Same rules as the tenant's own settings page - an image, under 1.5 MB,
   * stored as a data URL - because it is the same column. A logo that would
   * be refused at their door should not be accepted at ours.
   */
  const uploadLogo = useCallback((tenantId: string, file: File) => {
    setLogoError("");
    if (!file.type.startsWith("image/")) {
      setLogoError("That is not an image. Use a PNG, JPG, SVG or WebP.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoError("Too large. Use an image under 1.5 MB.");
      return;
    }
    setLogoBusy(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) { setLogoBusy(false); return; }
      // Show it before the round trip; the PATCH corrects hasLogo after.
      setLogoFor({ id: tenantId, url: dataUrl });
      await patchTenant(tenantId, { logoUrl: dataUrl }, "Logo saved.");
      setLogoBusy(false);
    };
    reader.onerror = () => {
      setLogoError("Could not read that file.");
      setLogoBusy(false);
    };
    reader.readAsDataURL(file);
  }, [patchTenant]);

  const removeLogo = useCallback(async (tenantId: string) => {
    setLogoError("");
    setLogoBusy(true);
    setLogoFor({ id: tenantId, url: null });
    await patchTenant(tenantId, { logoUrl: null }, "Logo removed.");
    setLogoBusy(false);
  }, [patchTenant]);

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

  const fetchRequests = useCallback(async (key: string) => {
    try {
      const res = await fetch("/api/trial-request", { headers: { "x-admin-key": key } });
      if (res.ok) setRequests(await res.json());
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    if (adminKey) {
      fetchTenants(adminKey);
      fetchRequests(adminKey);
    }
  }, [adminKey, fetchTenants, fetchRequests]);

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
      setCreatedInfo({
        org: data.name,
        email: data.owner.email,
        setupUrl: data.setupPath ? `${window.location.origin}${data.setupPath}` : null,
      });
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
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-10">
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
                Send the owner (<span className="font-mono">{createdInfo.email}</span>) their
                one-time setup link so they can choose a password — it works once and expires,
                then they&rsquo;re walked through onboarding.
                {createdInfo.setupUrl && (
                  <>
                    <span className="block mt-1 font-mono break-all text-emerald-300">{createdInfo.setupUrl}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(createdInfo.setupUrl!)}
                      className="mt-1 inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-100 underline"
                    >
                      <Copy className="w-3 h-3" /> copy setup link
                    </button>
                  </>
                )}
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
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4"
                >
                  <div className="flex flex-wrap items-center gap-4">
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
                        <PlanBadge plan={t.plan} trialEndsAt={t.trialEndsAt} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        Owner: {t.owner ? `${t.owner.name} · ${t.owner.email}` : "—"}
                        {" · "}
                        {(t.storageUsedBytes / (1024 * 1024)).toFixed(1)} / {t.uploadLimitMb} MB used
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
                    <button
                      onClick={() => {
                        const opening = manageFor !== t.id;
                        setManageFor(opening ? t.id : null);
                        setPlanMsg(null);
                        if (opening) {
                          setTrialDaysInput("14");
                          setStorageInput(String(t.uploadLimitMb));
                          setLogoError("");
                          loadLogo(t.id);
                        } else {
                          setLogoFor(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] transition-colors"
                    >
                      <Gauge className="w-3.5 h-3.5" /> Manage plan
                    </button>
                    <button
                      onClick={() => {
                        setResetFor(resetFor === t.id ? null : t.id);
                        setResetPw("");
                        setResetMsg(null);
                      }}
                      disabled={!t.owner}
                      title={t.owner ? "Reset owner password" : "No owner account"}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Reset password
                    </button>
                  </div>

                  {manageFor === t.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                      {/* Plan */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 w-20">Plan</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={1} value={trialDaysInput}
                            onChange={(e) => setTrialDaysInput(e.target.value)}
                            className="w-16 px-2 py-1.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => patchTenant(t.id, { trialDays: Number(trialDaysInput) }, `Trial set to ${trialDaysInput} days from now.`)}
                            disabled={planBusy === t.id}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
                          >
                            Set trial (days)
                          </button>
                        </div>
                        <button
                          onClick={() => patchTenant(t.id, { plan: "FULL" }, "Upgraded to full access.")}
                          disabled={planBusy === t.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Grant full access
                        </button>
                        {t.plan === "FULL" && (
                          <button
                            onClick={() => patchTenant(t.id, { trialDays: 14 }, "Moved back to a 14-day trial.")}
                            disabled={planBusy === t.id}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
                          >
                            Back to trial
                          </button>
                        )}
                      </div>
                      {/* Storage */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 w-20">Storage</span>
                        <input
                          type="number" min={1} value={storageInput}
                          onChange={(e) => setStorageInput(e.target.value)}
                          className="w-24 px-2 py-1.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-500">MB total for the organization</span>
                        <button
                          onClick={() => patchTenant(t.id, { uploadLimitMb: Number(storageInput) }, `Storage limit set to ${storageInput} MB.`)}
                          disabled={planBusy === t.id}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
                        >
                          Set limit
                        </button>
                      </div>
                      {/* Branding — whose mark the product wears for them */}
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="text-xs text-slate-500 w-20 mt-2">Branding</span>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Previewed on black on purpose: the sidebar is dark
                                in every theme, so that is the only background
                                the answer to "does this logo work" depends on. */}
                            <div className="w-24 h-10 rounded-lg bg-black border border-white/[0.10] flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoFor?.id === t.id && logoFor.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoFor.url} alt="" className="max-w-full max-h-full object-contain p-1" />
                              ) : (
                                <span className="text-[10px] text-slate-600">no logo</span>
                              )}
                            </div>
                            <label className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-300 transition-colors ${
                              logoBusy ? "opacity-60 cursor-wait" : "hover:bg-white/[0.05] cursor-pointer"
                            }`}>
                              <ImageIcon className="w-3.5 h-3.5" />
                              {t.hasLogo ? "Replace logo" : "Upload logo"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={logoBusy}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) uploadLogo(t.id, f);
                                  // so picking the same file twice still fires
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {t.hasLogo && (
                              <button
                                onClick={() => removeLogo(t.id)}
                                disabled={logoBusy}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                            <button
                              onClick={() => patchTenant(
                                t.id,
                                { whiteLabel: !t.whiteLabel },
                                t.whiteLabel
                                  ? "Back to the Vibrnd mark."
                                  : "Their own logo now shows in the sidebar.",
                              )}
                              disabled={planBusy === t.id || (!t.whiteLabel && !t.hasLogo)}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                t.whiteLabel
                                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                                  : "border border-white/[0.08] text-slate-300 hover:bg-white/[0.05]"
                              }`}
                            >
                              {t.whiteLabel ? "Their logo — on" : "Use their logo"}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">
                            {t.hasLogo
                              ? "Replaces the Vibrnd mark in their sidebar. It sits on dark chrome, so check it reads against the black above."
                              : "Upload one here, or they can add it themselves in Settings. Same logo either way."}
                          </p>
                          {logoError && (
                            <p className="text-xs text-red-300">{logoError}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {planMsg?.id === t.id && (
                    <p className={`mt-2 text-xs rounded-lg px-3 py-2 border ${planMsg.error ? "text-red-300 bg-red-500/10 border-red-500/25" : "text-emerald-300 bg-emerald-500/10 border-emerald-500/25"}`}>
                      {planMsg.text}
                    </p>
                  )}

                  {resetFor === t.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06]">
                      <p className="text-xs text-slate-400 mb-2">
                        Reset the password for <span className="text-slate-200">{t.owner?.email}</span>.
                        Set a temporary one to hand over, or clear it so they set their own on next sign-in.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                          placeholder="New temporary password (min 8 chars)"
                          className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => resetOwnerPassword(t.id, false)}
                          disabled={resetBusy}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 transition-colors"
                        >
                          {resetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                          Set password
                        </button>
                        <button
                          onClick={() => resetOwnerPassword(t.id, true)}
                          disabled={resetBusy}
                          className="text-xs font-medium px-3 py-2 rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] disabled:opacity-60 transition-colors"
                        >
                          Clear (owner re-sets)
                        </button>
                      </div>
                    </div>
                  )}

                  {resetMsg?.id === t.id && (
                    <p className="mt-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">
                      {resetMsg.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Trial requests (public leads) */}
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Trial Requests</h2>
            <span className="text-xs text-slate-500">({requests.length})</span>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-sm text-slate-500">
              No trial requests yet — submissions from the public form appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{r.agencyName}</p>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                      {r.status}
                    </span>
                    {r.location && <span className="text-xs text-slate-500">· {r.location}</span>}
                    {r.teamSize && <span className="text-xs text-slate-500">· {r.teamSize} people</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{r.contactName}</span>
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                      <Mail className="w-3 h-3" /> {r.email}
                    </a>
                    {r.phone && <span>{r.phone}</span>}
                    {r.website && <a href={r.website} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-200 underline">{r.website}</a>}
                  </p>
                  {r.services && <p className="text-xs text-slate-500 mt-2 leading-relaxed"><span className="text-slate-400">Services:</span> {r.services}</p>}
                  {r.message && <p className="text-xs text-slate-500 mt-1 leading-relaxed italic">“{r.message}”</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
