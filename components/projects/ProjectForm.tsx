"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import type { ProjectFormData, ProjectType, ProjectStatus, ClientSummary } from "@/types";
import { Select } from "@/components/ui/Select";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "Other"];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "DRAFT",     label: "Draft" },
  { value: "ACTIVE",    label: "Active" },
  { value: "ON_HOLD",   label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const TYPE_OPTIONS: { value: ProjectType; label: string; desc: string }[] = [
  { value: "ONE_TIME", label: "One-Time", desc: "Fixed scope with a defined end date" },
  { value: "RETAINER", label: "Retainer", desc: "Recurring engagement at a set frequency" },
];

export const RECURRING_FREQUENCIES = [
  { value: "weekly",      label: "Weekly" },
  { value: "biweekly",    label: "Bi-Weekly (Every 2 weeks)" },
  { value: "monthly",     label: "Monthly" },
  { value: "quarterly",   label: "Quarterly (Every 3 months)" },
  { value: "halfyearly",  label: "Half-Yearly (Every 6 months)" },
  { value: "yearly",      label: "Yearly" },
];

export const SERVICE_TYPES: { value: string; label: string; defaultType: ProjectType }[] = [
  { value: "",                  label: "Select service type",        defaultType: "ONE_TIME" },
  { value: "website",           label: "Website Design & Dev",       defaultType: "ONE_TIME" },
  { value: "social_media",      label: "Social Media Management",    defaultType: "RETAINER" },
  { value: "seo",               label: "SEO (Search Engine Optim.)", defaultType: "RETAINER" },
  { value: "geo",               label: "GEO (Generative Engine Optim.)", defaultType: "RETAINER" },
  { value: "gmb",               label: "GMB (Google My Business)",   defaultType: "RETAINER" },
  { value: "branding",          label: "Branding & Identity",        defaultType: "ONE_TIME" },
  { value: "logo",              label: "Logo Design",                defaultType: "ONE_TIME" },
  { value: "uiux",              label: "UI/UX Design",               defaultType: "ONE_TIME" },
  { value: "video",             label: "Video Production",           defaultType: "ONE_TIME" },
  { value: "photography",       label: "Photography",                defaultType: "ONE_TIME" },
  { value: "content",           label: "Content Writing",            defaultType: "RETAINER" },
  { value: "email_marketing",   label: "Email Marketing",            defaultType: "RETAINER" },
  { value: "paid_ads",          label: "Paid Ads / PPC",             defaultType: "RETAINER" },
  { value: "app_development",   label: "App Development",            defaultType: "ONE_TIME" },
  { value: "pr",                label: "PR & Communications",        defaultType: "RETAINER" },
  { value: "other",             label: "Other",                      defaultType: "ONE_TIME" },
];

/** Role shown under a name when they hold no job title. */
const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", SMM: "SMM", TEAM: "Team",
};

const EMPTY: ProjectFormData = {
  clientId: "", name: "", description: "", type: "ONE_TIME", serviceType: "",
  recurringFrequency: "",
  status: "DRAFT", startDate: "", endDate: "", budget: "", currency: "USD",
};

// ── v3: the project is the commercial unit (docs/V3_CONTEXT.md §3) ──

interface DeliverableRow {
  creativeTypeId: string;
  qtyPerCycle: string;
}

interface MemberRow {
  userId: string;
  role: "SMM" | "CONTRIBUTOR";
}

interface CreativeTypeOption {
  id: string; name: string; icon: string | null;
}

interface TeamOption {
  id: string; name: string; role: string;
  jobTitle?: { id: string; name: string } | null;
}

function FormField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/** A titled step, so the form reads as the five decisions it actually is. */
function Step({ n, title, hint, children }: {
  n: number; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="border border-gray-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
          {n}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

interface ProjectFormProps {
  initialData?: Partial<ProjectFormData>;
  projectId?: string;
  defaultClientId?: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
}

export function ProjectForm({ initialData, projectId, defaultClientId, onSuccess, onCancel }: ProjectFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectFormData>({
    ...EMPTY,
    ...(defaultClientId && { clientId: defaultClientId }),
    ...initialData,
    // If stored serviceType is a custom string, show "other" in the dropdown
    ...(initialData?.serviceType && !SERVICE_TYPES.some((s) => s.value === initialData.serviceType)
      ? { serviceType: "other" }
      : {}),
  });
  const [clients, setClients] = useState<ClientSummary[]>([]);
  // For "other" service type: store the custom label separately
  const isKnownServiceType = (v?: string) =>
    !v || SERVICE_TYPES.some((s) => s.value === v);
  const [customServiceType, setCustomServiceType] = useState(
    initialData?.serviceType && !isKnownServiceType(initialData.serviceType)
      ? initialData.serviceType
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // v3 commercial fields
  const { user: currentUser } = useCurrentUser();
  const canPrice = can(currentUser, "projects.pricing");
  const [cycleAmount, setCycleAmount] = useState(initialData?.cycleAmount ?? "");
  const [cycleStartDate, setCycleStartDate] = useState(initialData?.cycleStartDate ?? "");
  const [cycleEndDate, setCycleEndDate] = useState(initialData?.cycleEndDate ?? "");
  const [openEnded, setOpenEnded] = useState(!initialData?.cycleEndDate);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>(
    initialData?.deliverables?.length
      ? initialData.deliverables
      : [{ creativeTypeId: "", qtyPerCycle: "" }],
  );
  const [members, setMembers] = useState<MemberRow[]>(initialData?.members ?? []);
  const [creativeTypes, setCreativeTypes] = useState<CreativeTypeOption[]>([]);
  const [team, setTeam] = useState<TeamOption[]>([]);

  const isEdit = Boolean(projectId);

  /**
   * Opened from a client's page, or editing an existing project — either way
   * the client is settled and the field becomes a label rather than a choice.
   */
  const clientLocked = Boolean(defaultClientId) || isEdit;
  const lockedClient = clients.find((c) => c.id === form.clientId);
  const lockedClientName = lockedClient
    ? (lockedClient.companyName ? `${lockedClient.companyName} (${lockedClient.name})` : lockedClient.name)
    : null;
  const set = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    // The picker only offers ACTIVE clients, but a project can be created
    // from a prospect's page — so fetch the locked one by id too, or its
    // name would never resolve.
    fetch("/api/clients?status=ACTIVE")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
    const lockedId = defaultClientId || initialData?.clientId;
    if (lockedId) {
      fetch(`/api/clients/${lockedId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (!c?.id) return;
          setClients((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
        })
        .catch(() => {});
    }
    fetch("/api/creative-types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCreativeTypes(d); })
      .catch(() => {});
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTeam(d); })
      .catch(() => {});
  }, [defaultClientId, initialData?.clientId]);

  // ── deliverable rows ──
  const setDeliverable = (i: number, patch: Partial<DeliverableRow>) =>
    setDeliverables((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addDeliverable = () =>
    setDeliverables((rows) => [...rows, { creativeTypeId: "", qtyPerCycle: "" }]);
  const removeDeliverable = (i: number) =>
    setDeliverables((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i)));

  // ── team ──
  const toggleMember = (userId: string, role: "SMM" | "CONTRIBUTOR") =>
    setMembers((rows) => {
      const existing = rows.find((m) => m.userId === userId);
      if (existing && existing.role === role) return rows.filter((m) => m.userId !== userId);
      if (existing) return rows.map((m) => (m.userId === userId ? { ...m, role } : m));
      return [...rows, { userId, role }];
    });
  const memberRole = (userId: string) => members.find((m) => m.userId === userId)?.role ?? null;

  /**
   * Who can plan a project: someone with the SMM role, or an admin/manager
   * covering (docs/V3_CONTEXT.md §2). A junior can't — they don't hold
   * content.plan — so offering them here would only lead to a 403 later.
   */
  // When the SMM's plan is due. Sent through to the planning task they get.
  const [planningDueAt, setPlanningDueAt] = useState("");

  const smmCandidates = team.filter((u) =>
    ["SMM", "ADMIN", "MANAGER", "OWNER"].includes(u.role),
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.clientId) errs.clientId = "Please select a client";
    if (!form.name.trim()) errs.name = "Project name is required";
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      errs.endDate = "End date must be after start date";
    }
    // v3: the only amount the form collects is the cycle amount, and it's
    // a number input — nothing left to validate as free text.
    if (cycleAmount && isNaN(parseFloat(cycleAmount))) {
      errs.cycleAmount = "That doesn't look like a number";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const cleanDeliverables = deliverables
        .filter((d) => d.creativeTypeId && Number(d.qtyPerCycle) > 0)
        .map((d) => ({ creativeTypeId: d.creativeTypeId, qtyPerCycle: Number(d.qtyPerCycle) }));

      const payload = {
        ...form,
        serviceType: form.serviceType === "other"
          ? (customServiceType.trim() || "other")
          : form.serviceType,
        // v3 commercials. The period falls back to the project dates so a
        // form filled the old way still produces cycles.
        cycleAmount: canPrice ? cycleAmount : undefined,
        cycleStartDate: cycleStartDate || form.startDate || null,
        cycleEndDate: openEnded ? null : (cycleEndDate || form.endDate || null),
        deliverables: cleanDeliverables,
        members,
        planningDueAt: planningDueAt || null,
      };
      const res = await fetch(isEdit ? `/api/projects/${projectId}` : "/api/projects", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");

      // On edit the deliverables and members go through their own endpoints,
      // so the project PATCH stays a plain field update.
      if (isEdit && projectId) {
        await fetch(`/api/projects/${projectId}/deliverables`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliverables: cleanDeliverables }),
        }).catch(() => {});
        for (const m of members) {
          await fetch(`/api/projects/${projectId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...m, planningDueAt: planningDueAt || null }),
          }).catch(() => {});
        }
      }

      onSuccess ? onSuccess(data.id) : router.push(`/projects/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleServiceTypeChange = (value: string) => {
    set("serviceType", value);
    if (value !== "other") setCustomServiceType("");
    const svc = SERVICE_TYPES.find((s) => s.value === value);
    if (svc && value !== "" && value !== "other") set("type", svc.defaultType);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Project type */}
      <div className="grid grid-cols-2 gap-3">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value} type="button" onClick={() => set("type", opt.value)}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              form.type === opt.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div>
              <p className={`text-sm font-semibold ${form.type === opt.value ? "text-indigo-700" : "text-gray-800"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Service Type */}
      <div>
        <FormField label="Service Type">
          <div className="relative">
            <Select
              value={form.serviceType}
              onChange={(v) => handleServiceTypeChange(v)}
              options={[...SERVICE_TYPES.map((s) => ({ value: s.value, label: String(s.label) }))]}
            />
          </div>
          {form.serviceType === "other" && (
            <input
              type="text"
              value={customServiceType}
              onChange={(e) => setCustomServiceType(e.target.value)}
              placeholder="Enter custom service type (e.g. Event Coverage)"
              className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {form.serviceType && form.serviceType !== "other" && (
            <p className="text-xs text-gray-500 mt-1.5">
              {SERVICE_TYPES.find((s) => s.value === form.serviceType)?.defaultType === "RETAINER"
                ? "→ Project type set to Retainer (ongoing engagement)"
                : "→ Project type set to One-Time (fixed scope)"}
            </p>
          )}
        </FormField>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* The client is only a question when it isn't already answered.
            Opened from a client's page (or an edit), it's decided — showing
            a picker there just invites picking the wrong one. */}
        <div className="col-span-2">
          <FormField label="Client" required error={fieldErrors.clientId}>
            {clientLocked ? (
              <div className="flex items-center gap-2.5 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-800 truncate">
                  {lockedClientName ?? "Loading…"}
                </span>
              </div>
            ) : (
              <div className="relative">
                <Select
                  value={form.clientId}
                  onChange={(v) => set("clientId", v)}
                  options={[{ value: "", label: "Select client" }, ...clients.map((c) => ({ value: c.id, label: String(c.companyName ? `${c.companyName} (${c.name})` : c.name) }))]}
                />
              </div>
            )}
          </FormField>
        </div>

        <div className="col-span-2">
          <FormField label="Project Name" required error={fieldErrors.name}>
            <input
              type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Brand Refresh 2024"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </FormField>
        </div>

        <div className="col-span-2">
          <FormField label="Description">
            <textarea
              value={form.description} onChange={(e) => set("description", e.target.value)}
              rows={3} placeholder="Brief overview of the project scope…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </FormField>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
          <div className="relative">
            <Select
              value={form.status}
              onChange={(v) => set("status", v as ProjectStatus)}
              options={[...STATUS_OPTIONS.map((o) => ({ value: o.value, label: `${o.label}` }))]}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Currency</label>
          <div className="relative">
            <Select
              value={form.currency}
              onChange={(v) => set("currency", v)}
              options={[...CURRENCIES.map((c) => ({ value: c, label: `${c}` }))]}
            />
          </div>
        </div>

        {form.type === "RETAINER" ? (
          <>
            <FormField label="Frequency">
              <div className="relative">
                <Select
                  value={form.recurringFrequency}
                  onChange={(v) => set("recurringFrequency", v)}
                  options={[{ value: "", label: "Select frequency" }, ...RECURRING_FREQUENCIES.map((f) => ({ value: f.value, label: String(f.label) }))]}
                />
              </div>
            </FormField>
            <FormField label="Start Date">
              <input
                type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Start Date">
              <input
                type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </FormField>
            <FormField label="End Date" error={fieldErrors.endDate}>
              <input
                type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)}
                min={form.startDate || undefined}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </FormField>
          </>
        )}

        {/* Budget used to live here. v3 has one number that matters — the
            cycle amount in Commercials — and asking for two invited the
            question of which one is real. The column stays for existing
            projects; the form no longer sets it. */}
      </div>

      {/* ── Deliverables — what the client is owed ── */}
      <Step
        n={3}
        title="Deliverables"
        hint={form.type === "RETAINER"
          ? "What this project owes the client every month — 15 Reels, 5 Posts, 1 Photo Shoot."
          : "What this project delivers in total — 5 Pages, 1 Logo."}
      >
        <div className="space-y-2">
          {deliverables.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Select
                  value={row.creativeTypeId}
                  onChange={(v) => setDeliverable(i, { creativeTypeId: v })}
                  options={[{ value: "", label: "Creative type…" }, ...creativeTypes.map((t) => ({ value: t.id, label: String(`${t.icon ? `${t.icon} ` : ""}${t.name}`) }))]}
                />
              </div>
              <input
                type="number" min="1" step="1" value={row.qtyPerCycle}
                onChange={(e) => setDeliverable(i, { qtyPerCycle: e.target.value })}
                placeholder="Qty"
                className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                {form.type === "RETAINER" ? "/ cycle" : "total"}
              </span>
              <button type="button" onClick={() => removeDeliverable(i)}
                disabled={deliverables.length === 1}
                className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addDeliverable}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
          <Plus className="w-3.5 h-3.5" /> Add deliverable
        </button>
      </Step>

      {/* ── Commercials — the amount and the period ── */}
      <Step
        n={4}
        title="Commercials"
        hint={canPrice
          ? "What the client pays, and over what period."
          : "The period this project runs for. Pricing is set by your manager."}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {canPrice && (
            <FormField
              label={form.type === "RETAINER" ? "Amount per cycle" : "Total amount"}
              error={fieldErrors.cycleAmount}
            >
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 select-none">
                  {form.currency}
                </span>
                <input
                  type="number" min="0" step="0.01" value={cycleAmount}
                  onChange={(e) => setCycleAmount(e.target.value)}
                  placeholder="20000"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </FormField>
          )}
          <FormField label="Period starts">
            <input
              type="date" value={cycleStartDate || form.startDate}
              onChange={(e) => setCycleStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </FormField>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 mb-2 cursor-pointer">
              <input type="checkbox" checked={openEnded}
                onChange={(e) => setOpenEnded(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Open-ended {form.type === "RETAINER" ? "(runs until cancelled)" : ""}
            </label>
            {!openEnded && (
              <FormField label="Period ends">
                <input
                  type="date" value={cycleEndDate || form.endDate}
                  onChange={(e) => setCycleEndDate(e.target.value)}
                  min={cycleStartDate || form.startDate || undefined}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </FormField>
            )}
          </div>
        </div>
      </Step>

      {/* ── Team ──
          Only the SMM is chosen here. They plan the cycle, and planning is
          what decides who does each piece — so naming contributors up front
          would be guessing at work that doesn't exist yet. They're added on
          the project once there's something to hand out. */}
      <Step
        n={5}
        title="Who plans this project?"
        hint="The SMM lays out each cycle and reviews the work that comes back. Choosing one creates their planning task straight away."
      >
        {team.length === 0 ? (
          <p className="text-xs text-gray-400">Loading team…</p>
        ) : smmCandidates.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nobody has the SMM role yet. Add one in Settings ▸ Users, or pick an
            admin or manager to plan it for now.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {smmCandidates.map((u) => {
              const chosen = memberRole(u.id) === "SMM";
              return (
                <button key={u.id} type="button"
                  onClick={() => toggleMember(u.id, "SMM")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    chosen
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    chosen ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-800 truncate">{u.name}</span>
                    <span className="block text-[11px] text-gray-400">
                      {u.jobTitle?.name ?? ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </span>
                  {chosen && (
                    <span className="text-[11px] font-medium text-indigo-600 flex-shrink-0">
                      Planning this
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {/* Only worth asking once somebody has been picked to do it. */}
        {members.some((m) => m.role === "SMM") && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Plan wanted by <span className="font-normal text-gray-400">— optional</span>
            </label>
            <input
              type="datetime-local"
              value={planningDueAt}
              onChange={(e) => setPlanningDueAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              The deadline on their planning task. Left empty, it defaults to two days out.
            </p>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-3">
          Editors, photographers and the rest are assigned per item while planning —
          nothing to decide here.
        </p>
      </Step>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel ?? (() => router.back())}>Cancel</Button>
        <Button type="submit" loading={saving}>
          {isEdit ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
