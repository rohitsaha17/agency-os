"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Users2, Globe, Mail, Phone, Star, TrendingDown, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import type { Stakeholder, StakeholderType } from "@/types";

const TYPE_TABS: { label: string; value: StakeholderType | "ALL" }[] = [
  { label: "All",           value: "ALL" },
  { label: "Freelancers",   value: "FREELANCER" },
  { label: "Agencies",      value: "AGENCY" },
  { label: "Vendors",       value: "VENDOR" },
  { label: "Internal Team", value: "INTERNAL_TEAM" },
];

const TYPE_COLORS: Record<StakeholderType, string> = {
  FREELANCER:    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  AGENCY:        "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  VENDOR:        "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  INTERNAL_TEAM: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

const TYPE_LABELS: Record<StakeholderType, string> = {
  FREELANCER:    "Freelancer",
  AGENCY:        "Agency",
  VENDOR:        "Vendor",
  INTERNAL_TEAM: "Internal",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", EXECUTIVE: "Executive",
  MANAGER: "Manager", MEMBER: "Member",
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatRate(rate: number | null, currency: string) {
  if (!rate) return null;
  return formatMoney(rate, currency, { precision: 0 });
}

export default function StakeholdersPage() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [tab, setTab]                   = useState<StakeholderType | "ALL">("ALL");

  const fetchStakeholders = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "ALL") params.set("type", tab);
    if (search) params.set("search", search);
    const res = await fetch(`/api/stakeholders?${params}`);
    if (res.ok) setStakeholders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchStakeholders(); }, [tab, search]);

  const stats = {
    total:    stakeholders.length,
    freelancers:    stakeholders.filter((s) => s.type === "FREELANCER").length,
    agencies:       stakeholders.filter((s) => s.type === "AGENCY").length,
    vendors:        stakeholders.filter((s) => s.type === "VENDOR").length,
    internalTeam:   stakeholders.filter((s) => s.type === "INTERNAL_TEAM").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Stakeholders</h1>
            <p className="text-sm text-gray-500 mt-0.5">Freelancers, agencies, vendors, and internal team members</p>
          </div>
          <Link href="/stakeholders/new">
            <Button icon={<Plus className="w-4 h-4" />}>Add Stakeholder</Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Total",         value: stats.total,       icon: <Users2  className="w-4 h-4 text-gray-400" /> },
            { label: "Freelancers",   value: stats.freelancers, icon: <Star    className="w-4 h-4 text-indigo-400" /> },
            { label: "Agencies",      value: stats.agencies,    icon: <Globe   className="w-4 h-4 text-purple-400" /> },
            { label: "Vendors",       value: stats.vendors,     icon: <TrendingDown className="w-4 h-4 text-amber-400" /> },
            { label: "Internal Team", value: stats.internalTeam, icon: <UserCog className="w-4 h-4 text-emerald-500" /> },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
              {s.icon}
              <div>
                <p className="text-lg font-semibold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-xs min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stakeholders..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto flex-wrap">
            {TYPE_TABS.map((t) => (
              <button
                key={t.value} onClick={() => setTab(t.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-1.5" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : stakeholders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Users2 className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">No stakeholders yet</p>
            <p className="text-xs text-gray-400 mb-5">Add freelancers, agencies, vendors, and internal team members</p>
            <Link href="/stakeholders/new">
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />}>Add First Stakeholder</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stakeholders.map((s) => (
              <Link key={s.id} href={`/stakeholders/${s.id}`}>
                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center flex-shrink-0 ${
                        s.type === "INTERNAL_TEAM" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                      }`}>
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                          {s.name}
                        </p>
                        {s.role ? (
                          <p className="text-xs text-gray-400">{ROLE_LABELS[s.role] ?? s.role}</p>
                        ) : s.defaultRate ? (
                          <p className="text-xs text-gray-400">{formatRate(s.defaultRate, s.currency)}/hr</p>
                        ) : null}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[s.type]}`}>
                      {TYPE_LABELS[s.type]}
                    </span>
                  </div>

                  {/* Skills */}
                  {s.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {s.skills.slice(0, 4).map((skill) => (
                        <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {skill}
                        </span>
                      ))}
                      {s.skills.length > 4 && (
                        <span className="text-xs text-gray-400">+{s.skills.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Contact */}
                  <div className="space-y-1 mb-3">
                    {s.email && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 flex-shrink-0" /> {s.email}
                      </p>
                    )}
                    {s.phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 flex-shrink-0" /> {s.phone}
                      </p>
                    )}
                  </div>

                  {/* Counts */}
                  {s._count && (
                    <div className="flex items-center gap-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                      <span>{s._count.expenses} expense{s._count.expenses !== 1 ? "s" : ""}</span>
                      <span>{s._count.contracts} contract{s._count.contracts !== 1 ? "s" : ""}</span>
                      {!s.isActive && (
                        <span className="ml-auto text-orange-500 font-medium">Inactive</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
