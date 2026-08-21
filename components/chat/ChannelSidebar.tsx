"use client";

import { useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can } from "@/lib/permissions";
import {
  Hash, Lock, Users, ChevronDown, ChevronRight, Plus,
  Search, Building2, FolderKanban, MessageCircle, Globe,
} from "lucide-react";
import type { Channel, ChannelType } from "@/types";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function ChannelIcon({ type, className = "w-3.5 h-3.5" }: { type: ChannelType; className?: string }) {
  switch (type) {
    case "GENERAL":          return <Hash className={className} />;
    case "PROJECT_INTERNAL": return <Lock className={className} />;
    case "PROJECT_CLIENT":   return <Users className={className} />;
    case "CLIENT":           return <Building2 className={className} />;
    case "DIRECT":           return <MessageCircle className={className} />;
  }
}

interface SectionProps {
  label: string;
  icon: React.ReactNode;
  channels: Channel[];
  activeId: string | null;
  onSelect: (ch: Channel) => void;
  onAdd?: () => void;
  defaultOpen?: boolean;
}

function ChannelSection({ label, icon, channels, activeId, onSelect, onAdd, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (channels.length === 0 && !onAdd) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors group"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex items-center gap-1.5 flex-1">{icon}{label}</span>
        {onAdd && (
          <span
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all"
          >
            <Plus className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <ul className="space-y-0.5 mt-0.5">
          {channels.map((ch) => {
            const isActive = ch.id === activeId;
            const hasUnread = (ch.unreadCount ?? 0) > 0;
            return (
              <li key={ch.id}>
                <button
                  onClick={() => onSelect(ch)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all text-left ${
                    isActive
                      ? "bg-white/[0.1] text-white font-medium"
                      : hasUnread
                      ? "text-white hover:bg-white/[0.06]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <ChannelIcon type={ch.type} />
                  <span className="flex-1 truncate text-[13px]">{ch.name}</span>
                  {hasUnread && !isActive && (
                    <span className="flex-shrink-0 w-4 h-4 bg-indigo-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {ch.unreadCount! > 9 ? "9+" : ch.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {channels.length === 0 && !onAdd && (
            <li className="px-5 py-1 text-xs text-slate-600 italic">No channels yet</li>
          )}
        </ul>
      )}
    </div>
  );
}

interface ChannelSidebarProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (ch: Channel) => void;
  onCreateChannel: () => void;
  loading?: boolean;
}

export function ChannelSidebar({
  channels, activeChannelId, onSelectChannel, onCreateChannel, loading = false,
}: ChannelSidebarProps) {
  const { user: me } = useCurrentUser();
  const canCreate = can(me, "content.plan");
  const [search, setSearch] = useState("");

  const filtered = search
    ? channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  const general = filtered.filter((c) => c.type === "GENERAL");

  // Group project channels
  const projectMap = new Map<string, { name: string; channels: Channel[] }>();
  filtered.filter((c) => c.type === "PROJECT_INTERNAL" || c.type === "PROJECT_CLIENT").forEach((c) => {
    if (!c.projectId) return;
    if (!projectMap.has(c.projectId)) {
      projectMap.set(c.projectId, { name: c.project?.name ?? c.name, channels: [] });
    }
    projectMap.get(c.projectId)!.channels.push(c);
  });

  // Group client channels
  const clientMap = new Map<string, { name: string; channels: Channel[] }>();
  filtered.filter((c) => c.type === "CLIENT").forEach((c) => {
    const key = c.clientId ?? c.name;
    if (!clientMap.has(key)) {
      const label = c.client
        ? (c.client.companyName || c.client.name)
        : c.name;
      clientMap.set(key, { name: label, channels: [] });
    }
    clientMap.get(key)!.channels.push(c);
  });

  return (
    <div className="flex flex-col h-full bg-slate-800/60 border-r border-slate-700/50">
      {/* Header */}
      <div className="h-14 flex items-center px-4 border-b border-slate-700/50 flex-shrink-0">
        <span className="text-white font-semibold text-sm flex-1">Messages</span>
        {/* Opening a channel is a planner's call — see POST /api/channels. */}
        {canCreate && (
          <button
            onClick={onCreateChannel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Create channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels…"
            className="w-full bg-slate-900/60 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-6 bg-slate-700/40 rounded-md animate-pulse mx-1" />
            ))}
          </div>
        ) : (
          <>
            {/* General */}
            <ChannelSection
              label="General"
              icon={<Globe className="w-3 h-3" />}
              channels={general}
              activeId={activeChannelId}
              onSelect={onSelectChannel}
              onAdd={onCreateChannel}
            />

            {/* Projects */}
            {Array.from(projectMap.entries()).map(([projectId, { name, channels: pChs }]) => (
              <ChannelSection
                key={projectId}
                label={name}
                icon={<FolderKanban className="w-3 h-3 text-indigo-400" />}
                channels={pChs}
                activeId={activeChannelId}
                onSelect={onSelectChannel}
              />
            ))}

            {/* Clients */}
            {Array.from(clientMap.entries()).map(([clientKey, { name, channels: cChs }]) => (
              <ChannelSection
                key={clientKey}
                label={name}
                icon={<Building2 className="w-3 h-3 text-amber-400" />}
                channels={cChs}
                activeId={activeChannelId}
                onSelect={onSelectChannel}
              />
            ))}

            {filtered.length === 0 && !loading && (
              <p className="px-4 py-6 text-xs text-slate-600 text-center">
                {search ? "No channels match your search" : "No channels yet"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
