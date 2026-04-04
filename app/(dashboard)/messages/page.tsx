"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Hash } from "lucide-react";
import { ChannelSidebar } from "@/components/chat/ChannelSidebar";
import { ChannelHeader } from "@/components/chat/ChannelHeader";
import { MessageFeed } from "@/components/chat/MessageFeed";
import { ComposeBox } from "@/components/chat/ComposeBox";
import { CreateChannelModal } from "@/components/chat/CreateChannelModal";
import { ManageMembersModal } from "@/components/chat/ManageMembersModal";
import type { Channel } from "@/types";

export default function MessagesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [manageChannel, setManageChannel] = useState<Channel | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        // Auto-select first channel if none selected
        setActiveChannel((prev) => {
          if (prev) {
            // Re-sync active channel data from fresh list
            const updated = data.find((c: Channel) => c.id === prev.id);
            return updated ?? prev;
          }
          return data[0] ?? null;
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Seed default channels on first load, then fetch
  useEffect(() => {
    fetch("/api/channels/seed", { method: "POST" })
      .finally(() => fetchChannels());
  }, [fetchChannels]);

  const handleChannelCreated = (channel: Channel) => {
    setChannels((prev) => [channel, ...prev]);
    setActiveChannel(channel);
  };

  const handleSelectChannel = (ch: Channel) => {
    setActiveChannel(ch);
  };

  return (
    <div className="flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-slate-950">
      {/* Channel sidebar */}
      <div className="w-64 flex-shrink-0">
        <ChannelSidebar
          channels={channels}
          activeChannelId={activeChannel?.id ?? null}
          onSelectChannel={handleSelectChannel}
          onCreateChannel={() => setShowCreate(true)}
          loading={loading}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 border-l border-slate-700/50">
        {activeChannel ? (
          <>
            <ChannelHeader
              channel={activeChannel}
              onManageMembers={() => setManageChannel(activeChannel)}
            />
            <MessageFeed
              channel={activeChannel}
              currentUser="Admin"
            />
            <ComposeBox
              channel={activeChannel}
              authorName="Admin"
              onMessageSent={() => {}}
            />
          </>
        ) : (
          <EmptyState onCreateChannel={() => setShowCreate(true)} />
        )}
      </div>

      {/* Modals */}
      <CreateChannelModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleChannelCreated}
      />

      {manageChannel && (
        <ManageMembersModal
          channel={manageChannel}
          open={!!manageChannel}
          onClose={() => setManageChannel(null)}
          onUpdated={fetchChannels}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreateChannel }: { onCreateChannel: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 ring-1 ring-slate-700">
        <MessageSquare className="w-7 h-7 text-slate-500" />
      </div>
      <h2 className="text-white font-semibold text-lg mb-2">No channel selected</h2>
      <p className="text-slate-500 text-sm max-w-xs mb-6">
        Pick a channel from the sidebar to start messaging, or create a new one.
      </p>
      <button
        onClick={onCreateChannel}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 transition-colors"
      >
        Create a channel
      </button>
    </div>
  );
}
