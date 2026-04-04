"use client";

import { useState } from "react";
import {
  Hash, Lock, Users, Building2, Info, X,
  UserPlus, Settings, ChevronDown,
} from "lucide-react";
import type { Channel, ChannelType } from "@/types";

function ChannelIcon({ type, className = "w-4 h-4" }: { type: ChannelType; className?: string }) {
  switch (type) {
    case "GENERAL":          return <Hash className={className} />;
    case "PROJECT_INTERNAL": return <Lock className={className} />;
    case "PROJECT_CLIENT":   return <Users className={className} />;
    case "CLIENT":           return <Building2 className={className} />;
    default:                 return <Hash className={className} />;
  }
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

interface ChannelHeaderProps {
  channel: Channel;
  onManageMembers?: () => void;
}

export function ChannelHeader({ channel, onManageMembers }: ChannelHeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const memberCount = channel._count?.members ?? channel.members?.length ?? 0;

  return (
    <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-900/50">
      <div className="flex items-center gap-3 px-5 h-14">
        <ChannelIcon type={channel.type} className="w-4 h-4 text-slate-400" />
        <div className="flex-1 min-w-0">
          <span className="text-white font-semibold text-sm">{channel.name}</span>
          {channel.description && (
            <span className="text-slate-500 text-xs ml-2 truncate">{channel.description}</span>
          )}
        </div>

        {/* Context badge */}
        {channel.project && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <span className="text-[11px] text-indigo-400 font-medium truncate max-w-[120px]">{channel.project.name}</span>
            {channel.type === "PROJECT_INTERNAL" && <Lock className="w-2.5 h-2.5 text-indigo-400" />}
            {channel.type === "PROJECT_CLIENT" && <Users className="w-2.5 h-2.5 text-indigo-400" />}
          </div>
        )}
        {channel.client && !channel.project && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <span className="text-[11px] text-amber-400 font-medium truncate max-w-[120px]">
              {channel.client.companyName || channel.client.name}
            </span>
          </div>
        )}

        {/* Member avatars */}
        {channel.members && channel.members.length > 0 && (
          <button
            onClick={onManageMembers}
            className="hidden sm:flex items-center gap-1 hover:bg-white/[0.06] rounded-lg px-2 py-1 transition-colors"
            title="Manage members"
          >
            <div className="flex -space-x-1.5">
              {channel.members.slice(0, 4).map((m) => (
                <div
                  key={m.userId}
                  title={m.user.name}
                  className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-slate-900"
                >
                  {initials(m.user.name)}
                </div>
              ))}
            </div>
            <span className="text-xs text-slate-500 ml-1">{memberCount}</span>
          </button>
        )}

        {/* Info toggle */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className={`p-1.5 rounded-lg transition-colors ${showInfo ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"}`}
          title="Channel info"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="px-5 pb-3 text-sm text-slate-400 border-t border-slate-700/50 pt-3 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs">
              <span className="text-slate-500">Type: </span>
              <span className="capitalize text-slate-300">{channel.type.replace(/_/g, " ").toLowerCase()}</span>
            </p>
            {channel.description && (
              <p className="text-xs">
                <span className="text-slate-500">Description: </span>
                <span className="text-slate-300">{channel.description}</span>
              </p>
            )}
            {channel.project && (
              <p className="text-xs">
                <span className="text-slate-500">Project: </span>
                <span className="text-slate-300">{channel.project.name}</span>
              </p>
            )}
            {channel.client && (
              <p className="text-xs">
                <span className="text-slate-500">Client: </span>
                <span className="text-slate-300">{channel.client.companyName || channel.client.name}</span>
              </p>
            )}
          </div>
          {onManageMembers && (
            <button
              onClick={onManageMembers}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/10 transition-colors flex-shrink-0"
            >
              <UserPlus className="w-3 h-3" />
              Manage Members
            </button>
          )}
        </div>
      )}
    </div>
  );
}
