"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, FolderKanban, Users, CheckSquare, HardDrive,
  ChevronRight,
} from "lucide-react";

type ResultType = "client" | "project" | "task" | "file";

interface SearchResult {
  id: string;
  type: ResultType;
  label: string;
  sublabel?: string;
  status?: string;
  href: string;
}

const TYPE_META: Record<ResultType, { label: string; icon: React.ReactNode; color: string }> = {
  client:  { label: "Client",  icon: <Users className="w-3.5 h-3.5" />,      color: "text-amber-600 bg-amber-50" },
  project: { label: "Project", icon: <FolderKanban className="w-3.5 h-3.5" />, color: "text-indigo-600 bg-indigo-50" },
  task:    { label: "Task",    icon: <CheckSquare className="w-3.5 h-3.5" />, color: "text-emerald-600 bg-emerald-50" },
  file:    { label: "File",    icon: <HardDrive className="w-3.5 h-3.5" />,   color: "text-gray-600 bg-gray-100" },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setActive(0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && results[active]) navigate(results[active].href);
  };

  // Group by type
  const grouped = results.reduce<Record<ResultType, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<ResultType, SearchResult[]>);

  let flatIndex = 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors w-full"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
        <span className="flex-1 text-left text-xs text-slate-500">Search…</span>
        <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-500 font-mono">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search clients, projects, tasks, files…"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
            />
            {query && (
              <button onClick={() => setQuery("")} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50"
            >
              Esc
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {loading && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Searching…</div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">No results for "{query}"</p>
                <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
              </div>
            )}

            {!loading && query.length < 2 && (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                Type at least 2 characters to search
              </div>
            )}

            {!loading && results.length > 0 && (
              (["client", "project", "task", "file"] as ResultType[]).map((type) => {
                const items = grouped[type];
                if (!items?.length) return null;
                const meta = TYPE_META[type];
                return (
                  <div key={type} className="mb-1">
                    <div className="px-4 py-1.5 flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${meta.color}`}>
                        {meta.icon} {meta.label}s
                      </span>
                    </div>
                    {items.map((r) => {
                      const idx = flatIndex++;
                      const isActive = idx === active;
                      return (
                        <button
                          key={r.id}
                          onClick={() => navigate(r.href)}
                          onMouseEnter={() => setActive(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isActive ? "bg-indigo-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}>
                            {meta.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isActive ? "text-indigo-700" : "text-gray-900"}`}>
                              {r.label}
                            </p>
                            {r.sublabel && (
                              <p className="text-xs text-gray-400 truncate">{r.sublabel}</p>
                            )}
                          </div>
                          {r.status && (
                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                              {r.status.replace("_", " ")}
                            </span>
                          )}
                          <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-gray-300"}`} />
                        </button>
                      );
                    })
                    }
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
            <span><kbd className="font-mono bg-gray-100 px-1 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-gray-100 px-1 rounded">↵</kbd> open</span>
            <span><kbd className="font-mono bg-gray-100 px-1 rounded">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </>
  );
}
