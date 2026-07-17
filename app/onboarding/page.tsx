"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Building2, MapPin, Globe2 } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];
const TIMEZONES = [
  "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore",
  "Europe/London", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Australia/Sydney",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; organization?: { name: string } | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", website: "",
    address: "", city: "", country: "",
    currency: "USD", timezone: "Asia/Kolkata", logoUrl: "",
  });

  const set = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.id) { router.replace("/login"); return; }
        setMe(data);
        // Prefill agency name if the platform admin set a real one
        const orgName = data.organization?.name;
        if (orgName && orgName !== "My Agency") {
          setForm((f) => ({ ...f, name: orgName }));
        }
        if (data.organization?.onboardingCompleted) router.replace("/");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Agency name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organization/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : data?.error?.message;
        throw new Error(msg || "Failed to save");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient gradient */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-indigo-600/15 blur-[130px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="flex items-center gap-3 text-white mb-10">
          <BrandLogo className="w-9 h-9" />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Vibrnd</p>
            <p className="text-[9px] font-medium tracking-[0.25em] uppercase text-slate-400">Studio Flow</p>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">
          {me ? `Welcome, ${me.name.split(" ")[0]} 👋` : "Welcome 👋"}
        </h1>
        <p className="mt-2 text-slate-400">
          Let&rsquo;s set up your agency. These details appear across the app and
          on every PDF you send — quotations, invoices and contracts.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}

          {/* Agency identity */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">Agency identity</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Agency name *</label>
                <input
                  type="text" required value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Vibrnd Creative Studio"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Business email</label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="hello@youragency.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Phone</label>
                <input
                  type="tel" value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Website</label>
                <input
                  type="text" value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="youragency.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo URL <span className="text-slate-600">(optional)</span></label>
                <input
                  type="text" value={form.logoUrl}
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://…/logo.png"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Location */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 mb-5">
              <MapPin className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">Location</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Address</label>
                <input
                  type="text" value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">City</label>
                <input
                  type="text" value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Country</label>
                <input
                  type="text" value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Regional */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Globe2 className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">Regional defaults</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Timezone</label>
                <select
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Launch my workspace <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-xs text-slate-600 text-center pb-8">
            Everything here can be changed later in Settings → Organization.
          </p>
        </form>
      </div>
    </div>
  );
}
