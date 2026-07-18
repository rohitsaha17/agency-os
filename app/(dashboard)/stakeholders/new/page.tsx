"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import type { StakeholderType, StakeholderRole } from "@/types";

const TYPE_OPTIONS: { value: StakeholderType; label: string; desc: string }[] = [
  { value: "FREELANCER",    label: "Freelancer",    desc: "Individual contractor for specific tasks" },
  { value: "AGENCY",        label: "Agency",        desc: "Another creative or marketing agency" },
  { value: "VENDOR",        label: "Vendor",        desc: "Software, tools, or service provider" },
  { value: "INTERNAL_TEAM", label: "Internal Team", desc: "In-house employee or team member" },
];

const ROLE_OPTIONS: { value: StakeholderRole; label: string }[] = [
  { value: "OWNER",     label: "Owner / Founder" },
  { value: "ADMIN",     label: "Admin" },
  { value: "EXECUTIVE", label: "Executive" },
  { value: "FINANCE",   label: "Finance" },
  { value: "MANAGER",   label: "Manager" },
  { value: "MEMBER",    label: "Team Member" },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}

export default function NewStakeholderPage() {
  const router = useRouter();
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [form, setForm] = useState({
    name: "", type: "FREELANCER" as StakeholderType,
    role: "" as StakeholderRole | "",
    email: "", phone: "", website: "", address: "",
    skills: [] as string[],
    notes: "",
  });

  const set = (k: string, v: string | string[]) => setForm((f) => ({ ...f, [k]: v }));

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills.includes(s)) {
      set("skills", [...form.skills, s]);
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => set("skills", form.skills.filter((s) => s !== skill));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/stakeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: form.role || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create stakeholder");
      router.push(`/stakeholders/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  const isInternal = form.type === "INTERNAL_TEAM";

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/stakeholders" className="hover:text-gray-800 transition-colors">Stakeholders</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">Add Stakeholder</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Add Stakeholder</h1>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="grid grid-cols-2 gap-3">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value} type="button"
                  onClick={() => { set("type", t.value); if (t.value !== "INTERNAL_TEAM") set("role", ""); }}
                  className={`p-3 rounded-xl border-2 text-left transition-colors ${
                    form.type === t.value
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Role — only shown for internal team */}
          {isInternal && (
            <Field label="Role">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.value} type="button"
                    onClick={() => set("role", r.value)}
                    className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      form.role === r.value
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Name *">
            <Input value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Rahul Verma / Studio X" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email">
              <Input value={form.email} onChange={(v) => set("email", v)} placeholder="contact@example.com" type="email" />
            </Field>
            <Field label="Phone">
              <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} placeholder="Phone number" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Website">
              <Input value={form.website} onChange={(v) => set("website", v)} placeholder="example.com" />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(v) => set("address", v)} placeholder="City, Country" />
            </Field>
          </div>

          {/* Skills / Products & Services */}
          <Field
            label={
              isInternal ? "Skills & Expertise" :
              form.type === "VENDOR" ? "Products & Services" :
              "Skills & Specializations"
            }
            hint={
              form.type === "VENDOR"
                ? "What goods or services do they supply? Press Enter or comma to add"
                : "Press Enter or comma to add"
            }
          >
            <div className="flex gap-2 mb-2">
              <input
                type="text" value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); } }}
                placeholder={
                  isInternal ? "e.g. Strategy, Leadership" :
                  form.type === "VENDOR" ? "e.g. Web Hosting, Print, Stock Photography" :
                  "e.g. Branding, Video Editing"
                }
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addSkill}>Add</Button>
            </div>
            {form.skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.skills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                    {s}
                    <button type="button" onClick={() => removeSkill(s)} className="hover:text-indigo-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes} onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder={isInternal ? "Department, responsibilities, notes..." : "Payment terms, preferred contact method, specializations..."}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Link href="/stakeholders">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={saving}>Add Stakeholder</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
