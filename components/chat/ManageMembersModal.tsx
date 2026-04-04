"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Trash2, Check, Search } from "lucide-react";
import type { Channel } from "@/types";

interface Member {
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

interface ManageMembersModalProps {
  channel: Channel;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ManageMembersModal({ channel, open, onClose, onUpdated }: ManageMembersModalProps) {
  const [members, setMembers]     = useState<Member[]>([]);
  const [allUsers, setAllUsers]   = useState<UserOption[]>([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [adding, setAdding]       = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/channels/${channel.id}/members`).then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]).then(([m, u]) => {
      if (Array.isArray(m)) setMembers(m);
      if (Array.isArray(u)) setAllUsers(u);
    }).finally(() => setLoading(false));
  }, [open, channel.id]);

  const memberIds = new Set(members.map((m) => m.userId));

  const filteredUsers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const addUser = async (userId: string) => {
    setAdding(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/channels/${channel.id}/members`).then((r) => r.json());
        if (Array.isArray(updated)) setMembers(updated);
        onUpdated();
      }
    } finally {
      setAdding(false);
    }
  };

  const removeUser = async (userId: string) => {
    const res = await fetch(`/api/channels/${channel.id}/members?userId=${userId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      onUpdated();
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
            <div>
              <h2 className="text-white font-semibold">Manage Members</h2>
              <p className="text-xs text-slate-500 mt-0.5">#{channel.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Current members */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Current Members ({members.length})
              </p>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <p className="text-xs text-slate-600 italic py-2">No members yet</p>
              ) : (
                <ul className="space-y-1">
                  {members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/[0.03] group">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials(m.user.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{m.user.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{m.user.email}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-md capitalize">
                        {m.role.toLowerCase()}
                      </span>
                      <button
                        onClick={() => removeUser(m.userId)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add members */}
            <div className="px-5 pt-2 pb-4 border-t border-slate-700/50 mt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Add Members
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {filteredUsers.length === 0 ? (
                <p className="text-xs text-slate-600 italic text-center py-3">
                  {search ? "No users match your search" : "All users are already members"}
                </p>
              ) : (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {filteredUsers.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/[0.03]">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{u.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                      </div>
                      <button
                        onClick={() => addUser(u.id)}
                        disabled={adding}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
                      >
                        <UserPlus className="w-3 h-3" />
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium text-slate-400 border border-slate-700 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
