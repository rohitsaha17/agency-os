"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, X, Image, FileText, Film, File as FileIcon } from "lucide-react";
import type { Channel } from "@/types";

function FilePreviewChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isPdf   = file.type === "application/pdf";
  const Icon = isVideo ? Film : isPdf ? FileText : isImage ? Image : FileIcon;
  const size = file.size > 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${(file.size / 1024).toFixed(0)} KB`;

  return (
    <div className="flex items-center gap-1.5 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 max-w-[180px]">
      <Icon className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="truncate flex-1">{file.name}</span>
      <span className="text-slate-500 flex-shrink-0">{size}</span>
      <button onClick={onRemove} className="flex-shrink-0 text-slate-500 hover:text-slate-200 ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

interface ComposeBoxProps {
  channel: Channel;
  authorName?: string;
  onMessageSent: () => void;
}

export function ComposeBox({ channel, authorName = "You", onMessageSent }: ComposeBoxProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  }, []);

  const canSend = (body.trim().length > 0 || files.length > 0) && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        fd.append("body", body.trim());
        fd.append("authorName", authorName);
        files.forEach((f) => fd.append("files", f));
        res = await fetch(`/api/channels/${channel.id}/messages`, { method: "POST", body: fd });
      } else {
        res = await fetch(`/api/channels/${channel.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim(), authorName }),
        });
      }
      if (res.ok) {
        setBody("");
        setFiles([]);
        onMessageSent();
      }
    } finally {
      setSending(false);
      textRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-shrink-0 px-4 pb-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`border rounded-xl transition-colors ${
          dragging
            ? "border-indigo-500 bg-indigo-500/10"
            : "border-slate-700 bg-slate-800/60"
        }`}
      >
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {files.map((f, i) => (
              <FilePreviewChip key={i} file={f} onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        {/* Text area */}
        <textarea
          ref={textRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channel.name}`}
          rows={1}
          className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-600 px-4 py-3 resize-none focus:outline-none max-h-40 overflow-y-auto"
          style={{ fieldSizing: "content" } as React.CSSProperties}
          disabled={sending}
        />

        {/* Actions bar */}
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-slate-600 ml-1">
              {dragging ? "Drop to attach" : "Enter to send · Shift+Enter for new line"}
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              canSend
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "bg-slate-700 text-slate-600 cursor-not-allowed"
            }`}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
