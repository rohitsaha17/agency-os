"use client";

import { useState, useEffect } from "react";
import { X, Hash, Lock, Users, Building2, Globe } from "lucide-react";
import type { ChannelType, Channel } from "@/types";

const CHANNEL_TYPES: { value: ChannelType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: "GENERAL",
    label: "General",
    icon: <Globe className="w-4 h-4" />,
    desc: "Open to everyone in the team",
  },
  {
    value: "PROJECT_INTERNAL",
    label: "Project — Team Only",
    icon: <Lock className="w-4 h-4" />,
    desc: "Internal team channel for a specific project",
  },
  {
    value: "PROJECT_CLIENT",
    label: "Project — With Client",
    icon: <Users className="w-4 h-4" />,
    desc: "Shared with the client for a specific project",
  },
  {
    value: "CLIENT",
    label: "Client Channel",
    icon: <Building2 className="w-4 h-4" />,
    desc: "General communication for a client",
  },
];

interface CreateChannelModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export function CreateChannelModal({ open, onClose, onCreated }: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ChannelType>("GENERAL");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; companyName: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([p, c]) => {
      if (Array.isArray(p)) setProjects(p);
      if (Array.isArray(c)) setClients(c);
    });
  }, [open]);

  const needsProject = type === "PROJECT_INTERNAL" || type === "PROJECT_CLIENT";
  const needsClient  = type === "CLIENT";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Channel name is required"); return; }
    if (needsProject && !projectId) { setError("Please select a project"); return; }
    if (needsClient && !clientId) { setError("Please select a client"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          description: description.trim() || undefined,
          type,
          projectId: needsProject ? projectId : undefined,
          clientId:  needsClient  ? clientId  : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create channel"); return; }
      onCreated(data);
      onClose();
      setName(""); setDescription(""); setType("GENERAL"); setProjectId(""); setClientId("");
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="text-white font-semibold">Create Channel</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Channel type */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Channel Type</label>
              <div className="space-y-2">
                {CHANNEL_TYPES.map((t) => (
                  <label key={t.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    type === t.value
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 hover:border-slate-600"
                  }`}>
                    <input type="radio" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                    <div className={`flex-shrink-0 ${type === t.value ? "text-indigo-400" : "text-slate-500"}`}>{t.icon}</div>
                    <div>
                      <p className={`text-sm font-medium ${type === t.value ? "text-white" : "text-slate-300"}`}>{t.label}</p>
                      <p className="text-xs text-slate-500">{t.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Project selector */}
            {needsProject && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Project</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Client selector */}
            {needsClient && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Client</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} (${c.name})` : c.name}</option>)}
                </select>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Channel Name</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                  placeholder="e.g. design-feedback"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-600">(optional)</span></label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this channel about?"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-400 border border-slate-700 rounded-xl hover:bg-white/[0.04] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {saving ? "Creating…" : "Create Channel"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
