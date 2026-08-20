"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContractType, ContractPartyType, Client, Project, User } from "@/types";
import { Select } from "@/components/ui/Select";

const TYPE_OPTIONS: { value: ContractType; label: string }[] = [
  { value: "NDA",               label: "NDA" },
  { value: "SERVICE_AGREEMENT", label: "Service Agreement" },
  { value: "EMPLOYMENT",        label: "Employment Agreement" },
  { value: "FREELANCE",         label: "Freelance Contract" },
  { value: "PARTNERSHIP",       label: "Partnership Agreement" },
  { value: "OTHER",             label: "Other" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];

interface PartyForm {
  partyType:     ContractPartyType;
  clientId:      string;
  userId:        string;
  name:          string;
  email:         string;
}

const EMPTY_PARTY: PartyForm = {
  partyType: "CLIENT", clientId: "", userId: "", name: "", email: "",
};

export default function NewContractPage() {
  const router = useRouter();
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [clients, setClients]         = useState<Pick<Client, "id" | "name" | "companyName">[]>([]);
  const [projects, setProjects]       = useState<Pick<Project, "id" | "name">[]>([]);
  const [users, setUsers]             = useState<Pick<User, "id" | "name" | "email">[]>([]);

  const [form, setForm] = useState({
    title: "", type: "NDA" as ContractType,
    projectId: "", clientId: "",
    startDate: "", endDate: "",
    value: "", currency: "USD", notes: "",
  });
  const [parties, setParties] = useState<PartyForm[]>([{ ...EMPTY_PARTY }]);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]).then(([c, p, u]) => {
      setClients(Array.isArray(c) ? c : c.clients ?? []);
      setProjects(Array.isArray(p) ? p : p.projects ?? []);
      setUsers(Array.isArray(u) ? u : []);
    });
  }, []);

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const updateParty = (i: number, k: string, v: string) => {
    setParties((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      const updated = { ...p, [k]: v };
      // Auto-fill name+email when picking a known entity
      if (k === "clientId" && v) {
        const c = clients.find((c) => c.id === v);
        if (c) updated.name = c.companyName || c.name;
      }
      if (k === "userId" && v) {
        const user = users.find((u) => u.id === v);
        if (user) { updated.name = user.name; updated.email = user.email; }
      }
      if (k === "partyType") {
        updated.clientId = ""; updated.userId = "";
        updated.name = ""; updated.email = "";
      }
      return updated;
    }));
  };

  const addParty    = () => setParties((p) => [...p, { ...EMPTY_PARTY }]);
  const removeParty = (i: number) => setParties((p) => p.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (parties.some((p) => !p.name.trim())) { setError("All parties need a name"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parties }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create contract");
      router.push(`/contracts/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/contracts" className="hover:text-gray-800 transition-colors">Contracts</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">New Contract</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Create Contract / NDA</h1>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} required
              placeholder="e.g. NDA with Rahul Verma"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contract Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button key={t.value} type="button" onClick={() => setField("type", t.value)}
                  className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    form.type === t.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link to Project</label>
              <Select
                value={form.projectId}
                onChange={(v) => setField("projectId", v)}
                options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: `${p.name}` }))]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary Client</label>
              <Select
                value={form.clientId}
                onChange={(v) => setField("clientId", v)}
                options={[{ value: "", label: "None" }, ...clients.map((c) => ({ value: c.id, label: String(c.companyName ? `${c.companyName} (${c.name})` : c.name) }))]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Value</label>
              <input type="number" step="0.01" value={form.value} onChange={(e) => setField("value", e.target.value)}
                placeholder="0.00 (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <Select
                value={form.currency}
                onChange={(v) => setField("currency", v)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          {/* Parties */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Signing Parties</label>
              <button type="button" onClick={addParty}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-3 h-3" /> Add Party
              </button>
            </div>
            <div className="space-y-3">
              {parties.map((party, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Party {i + 1}</span>
                    {parties.length > 1 && (
                      <button type="button" onClick={() => removeParty(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Party type tabs */}
                  <div className="flex gap-1 mb-3 bg-white rounded-lg border border-gray-200 p-1 w-fit">
                    {(["CLIENT", "STAKEHOLDER", "USER"] as ContractPartyType[]).map((t) => (
                      <button key={t} type="button" onClick={() => updateParty(i, "partyType", t)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          party.partyType === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {t === "USER" ? "Internal User" : t.charAt(0) + t.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {party.partyType === "CLIENT" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Select Client</label>
                        <Select
                          value={party.clientId}
                          onChange={(v) => updateParty(i, "clientId", v)}
                          options={[{ value: "", label: "Pick client..." }, ...clients.map((c) => ({ value: c.id, label: String(c.companyName ? `${c.companyName} (${c.name})` : c.name) }))]}
                          size="sm"
                        />
                      </div>
                    )}
                    {/* v3: external parties are typed in directly — name and
                        email below are the whole record. */}
                    {party.partyType === "USER" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Select System User</label>
                        <Select
                          value={party.userId}
                          onChange={(v) => updateParty(i, "userId", v)}
                          options={[{ value: "", label: "Pick user..." }, ...users.map((u) => ({ value: u.id, label: `${u.name}` }))]}
                          size="sm"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name *</label>
                      <input value={party.name} onChange={(e) => updateParty(i, "name", e.target.value)} required
                        placeholder="Full name"
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input type="email" value={party.email} onChange={(e) => updateParty(i, "email", e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3}
              placeholder="Key terms, special clauses, payment conditions..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Link href="/contracts">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={saving}>Create Contract</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
