"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Mail, Phone, Globe, MapPin, Edit3, FileText, TrendingDown, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhoneInput } from "@/components/ui/PhoneInput";
import type { Stakeholder, StakeholderType, StakeholderRole } from "@/types";

const TYPE_COLORS: Record<StakeholderType, string> = {
  FREELANCER:    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  AGENCY:        "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  VENDOR:        "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  INTERNAL_TEAM: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

const TYPE_LABELS: Record<StakeholderType, string> = {
  FREELANCER: "Freelancer", AGENCY: "Agency",
  VENDOR: "Vendor", INTERNAL_TEAM: "Internal Team",
};

const ROLE_LABELS: Record<StakeholderRole, string> = {
  OWNER: "Owner", ADMIN: "Admin", EXECUTIVE: "Executive",
  FINANCE: "Finance", MANAGER: "Manager", MEMBER: "Member",
};

type StakeholderDetail = Stakeholder & {
  expenses: {
    id: string; title: string; amount: number; currency: string;
    status: string; date: string;
    project: { id: string; name: string } | null;
  }[];
  contracts: {
    id: string;
    contract: { id: string; title: string; type: string; status: string; createdAt: string };
  }[];
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function StakeholderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [stakeholder, setStakeholder] = useState<StakeholderDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [editOpen, setEditOpen]       = useState(false);
  const [editForm, setEditForm]       = useState({
    name: "", email: "", phone: "", website: "", address: "",
    role: "" as StakeholderRole | "",
    notes: "", isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchStakeholder = async () => {
    const res = await fetch(`/api/stakeholders/${id}`);
    if (res.ok) {
      const data = await res.json();
      setStakeholder(data);
      setEditForm({
        name: data.name, email: data.email || "", phone: data.phone || "",
        website: data.website || "", address: data.address || "",
        role: data.role || "",
        notes: data.notes || "", isActive: data.isActive,
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchStakeholder(); }, [id]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/stakeholders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, role: editForm.role || null }),
    });
    setSaving(false);
    setEditOpen(false);
    fetchStakeholder();
  };

  if (loading) return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
      <div className="h-10 bg-gray-200 rounded w-72" />
    </div>
  );

  if (!stakeholder) return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
      <p className="text-sm text-gray-500">Stakeholder not found</p>
      <Link href="/stakeholders" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to Stakeholders</Link>
    </div>
  );

  const totalExpenses = stakeholder.expenses
    .filter((e) => e.status !== "REJECTED")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const isInternal = stakeholder.type === "INTERNAL_TEAM";

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/stakeholders" className="hover:text-gray-800 transition-colors">Stakeholders</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">{stakeholder.name}</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full font-bold text-base flex items-center justify-center ${
              isInternal ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
            }`}>
              {initials(stakeholder.name)}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold text-gray-900">{stakeholder.name}</h1>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[stakeholder.type]}`}>
                  {TYPE_LABELS[stakeholder.type]}
                </span>
                {stakeholder.role && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                    <UserCog className="w-3 h-3" />
                    {ROLE_LABELS[stakeholder.role]}
                  </span>
                )}
                {!stakeholder.isActive && (
                  <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">Inactive</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                {stakeholder.email   && <span className="flex items-center gap-1"><Mail    className="w-3 h-3" />{stakeholder.email}</span>}
                {stakeholder.phone   && <span className="flex items-center gap-1"><Phone   className="w-3 h-3" />{stakeholder.phone}</span>}
                {stakeholder.website && <span className="flex items-center gap-1"><Globe   className="w-3 h-3" />{stakeholder.website}</span>}
                {stakeholder.address && <span className="flex items-center gap-1"><MapPin  className="w-3 h-3" />{stakeholder.address}</span>}
              </div>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>

        {/* Skills / Products & Services */}
        {stakeholder.skills.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              {stakeholder.type === "VENDOR" ? "Products & Services" :
               stakeholder.type === "INTERNAL_TEAM" ? "Skills & Expertise" :
               "Skills & Specializations"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stakeholder.skills.map((s) => (
                <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Total Paid</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {totalExpenses > 0 ? formatCurrency(totalExpenses, stakeholder.currency) : "—"}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Contracts</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">{stakeholder._count?.contracts ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expenses */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Recent Expenses</h3>
              <Link href={`/expenses?stakeholderId=${stakeholder.id}`} className="text-xs text-indigo-600 hover:underline">View all</Link>
            </div>
            {stakeholder.expenses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No expenses yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stakeholder.expenses.slice(0, 8).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{exp.title}</p>
                      <p className="text-xs text-gray-400">{exp.project?.name ?? "No project"} · {formatDate(exp.date)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(Number(exp.amount), exp.currency)}</p>
                      <p className={`text-xs ${exp.status === "PAID" ? "text-emerald-600" : exp.status === "REJECTED" ? "text-red-500" : "text-amber-600"}`}>
                        {exp.status.charAt(0) + exp.status.slice(1).toLowerCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Contracts</h3>
              <Link href={`/contracts?stakeholderId=${stakeholder.id}`} className="text-xs text-indigo-600 hover:underline">View all</Link>
            </div>
            {stakeholder.contracts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No contracts yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stakeholder.contracts.map(({ contract }) => (
                  <Link key={contract.id} href={`/contracts/${contract.id}`}>
                    <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contract.title}</p>
                        <p className="text-xs text-gray-400">{contract.type.replace("_", " ")} · {formatDate(contract.createdAt)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        contract.status === "FULLY_SIGNED"      ? "bg-emerald-50 text-emerald-700" :
                        contract.status === "PARTIALLY_SIGNED"  ? "bg-yellow-50 text-yellow-700"  :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {contract.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {stakeholder.notes && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{stakeholder.notes}</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <Modal open={editOpen} title="Edit Stakeholder" onClose={() => setEditOpen(false)}>
          <div className="space-y-4">
            {[
              { label: "Name",    key: "name",    placeholder: "Stakeholder name" },
              { label: "Email",   key: "email",   placeholder: "email@example.com" },
              { label: "Website", key: "website", placeholder: "example.com" },
              { label: "Address", key: "address", placeholder: "City, Country" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input
                  value={editForm[key as keyof typeof editForm] as string}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <PhoneInput value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} placeholder="Phone number" />
            </div>
            {isInternal && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as StakeholderRole | "" }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No role</option>
                  {(["OWNER", "ADMIN", "EXECUTIVE", "FINANCE", "MANAGER", "MEMBER"] as StakeholderRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="active" checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="active" className="text-sm text-gray-700">Active</label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button loading={saving} onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
