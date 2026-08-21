"use client";

/**
 * Approvals — the reviewer's queue, as a page rather than a drawer.
 *
 * It used to be a narrow side panel over the task list: a title, a link and
 * two buttons. Judging work needs the brief it was written against, the round
 * it's on, and what was actually handed in — none of which fitted, so the
 * reviewer approved on faith or opened the task somewhere else.
 *
 * Here the queue is a list on the left and the full submission on the right.
 * Filters narrow by who submitted it, which client it belongs to, and which
 * project — the three questions someone clearing a backlog actually asks.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck, ExternalLink, Link2, Paperclip, AlertCircle,
  CheckCircle2, RefreshCw, Inbox,
} from "lucide-react";
import { RequireCapability } from "@/components/layout/RequireCapability";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { RequestChangesDialog } from "@/components/tasks/ReviewDialogs";
import { CreativeTypeDot } from "@/components/content/CreativeTypeDot";
import { broadcastChange, useLiveRefresh } from "@/lib/live";
import { toast } from "@/lib/toast";

interface Delivery {
  id: string;
  method: string | null;
  url: string | null;
  remarks: string | null;
  deliveredAt: string;
  deliveredBy: { id: string; name: string } | null;
  file: { id: string; name: string; url: string } | null;
}

interface Submission {
  id: string;
  title: string;
  topic: string | null;
  content: string | null;
  description: string | null;
  referenceUrl: string | null;
  revision: number;
  dueDate: string | null;
  project: { id: string; name: string; client: { id: string; name: string } | null } | null;
  client: { id: string; name: string } | null;
  assignees: { user: { id: string; name: string } }[];
  contentItem: {
    id: string; topic: string; date: string;
    creativeType: { name: string; color: string | null } | null;
  } | null;
  deliveries: Delivery[];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function ApprovalsInner() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changesFor, setChangesFor] = useState<Submission | null>(null);

  const [byPerson, setByPerson] = useState("");
  const [byClient, setByClient] = useState("");
  const [byProject, setByProject] = useState("");

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/approvals");
      if (!res.ok) return;
      const d = await res.json();
      setItems(Array.isArray(d.submitted) ? d.submitted : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useLiveRefresh(["tasks"], fetchQueue);

  /** Filter options are built from the queue itself — no empty choices. */
  const options = useMemo(() => {
    const people = new Map<string, string>();
    const clients = new Map<string, string>();
    const projects = new Map<string, string>();
    for (const s of items) {
      for (const a of s.assignees) people.set(a.user.id, a.user.name);
      const c = s.project?.client ?? s.client;
      if (c) clients.set(c.id, c.name);
      if (s.project) projects.set(s.project.id, s.project.name);
    }
    const toOpts = (m: Map<string, string>, all: string) =>
      [{ value: "", label: all }, ...[...m].map(([value, label]) => ({ value, label }))];
    return {
      people: toOpts(people, "Everyone"),
      clients: toOpts(clients, "All clients"),
      projects: toOpts(projects, "All projects"),
    };
  }, [items]);

  const shown = useMemo(() => items.filter((s) => {
    if (byPerson && !s.assignees.some((a) => a.user.id === byPerson)) return false;
    if (byClient && (s.project?.client?.id ?? s.client?.id) !== byClient) return false;
    if (byProject && s.project?.id !== byProject) return false;
    return true;
  }), [items, byPerson, byClient, byProject]);

  // Keep a selection that still exists after filtering or a refresh.
  const selected = shown.find((s) => s.id === selectedId) ?? shown[0] ?? null;

  const decide = async (task: Submission, decision: "APPROVED") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error(d?.error?.message ?? "Couldn't approve that");
        return;
      }
      toast.success(`Approved "${task.title}"`);
      setSelectedId(null);
      await fetchQueue();
      broadcastChange("all");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-5 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              Approvals
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading
                ? "Loading…"
                : items.length === 0
                  ? "Nothing waiting on you"
                  : `${items.length} submission${items.length === 1 ? "" : "s"} waiting on you`}
            </p>
          </div>
          <button onClick={fetchQueue}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Select value={byPerson} onChange={setByPerson} options={options.people} size="sm" />
            <Select value={byClient} onChange={setByClient} options={options.clients} size="sm" />
            <Select value={byProject} onChange={setByProject} options={options.projects} size="sm" />
            {(byPerson || byClient || byProject) && (
              <button
                onClick={() => { setByPerson(""); setByClient(""); setByProject(""); }}
                className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {shown.length} of {items.length}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 p-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-base font-semibold text-gray-800">Queue is clear</p>
          <p className="text-sm text-gray-500 mt-1">Work submitted for your review lands here.</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* The queue */}
          <div className="w-full max-w-sm flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            {shown.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 px-4">
                Nothing matches those filters.
              </p>
            ) : shown.map((s) => {
              const isSel = selected?.id === s.id;
              const who = s.assignees[0]?.user;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                    isSel ? "bg-indigo-50 border-l-2 border-l-indigo-500" : "hover:bg-gray-50 border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {s.contentItem?.creativeType && (
                      <span className="mt-1.5"><CreativeTypeDot color={s.contentItem.creativeType.color} /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {s.project?.client?.name ?? s.client?.name ?? "No client"}
                        {s.project ? ` · ${s.project.name}` : ""}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {who && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-100 rounded-full pl-0.5 pr-2 py-0.5">
                            <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-bold flex items-center justify-center">
                              {initials(who.name)}
                            </span>
                            {who.name}
                          </span>
                        )}
                        {s.revision > 1 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                            Round {s.revision}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* The submission, in full */}
          <div className="flex-1 overflow-y-auto bg-gray-50 min-w-0">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                <Inbox className="w-4 h-4 mr-2" /> Pick something from the queue
              </div>
            ) : (
              <div className="p-6 max-w-3xl space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selected.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {selected.project?.client?.name ?? selected.client?.name ?? "No client"}
                    {selected.project ? ` · ${selected.project.name}` : ""}
                    {selected.revision > 1 ? ` · round ${selected.revision}` : ""}
                  </p>
                </div>

                {/* The brief it was written against */}
                {(selected.topic || selected.content || selected.referenceUrl) && (
                  <section className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      What was asked for
                    </p>
                    {selected.topic && (
                      <p className="text-sm text-gray-800"><span className="text-gray-400">Topic: </span>{selected.topic}</p>
                    )}
                    {selected.content && (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1.5">{selected.content}</p>
                    )}
                    {selected.referenceUrl && (
                      <a href={selected.referenceUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline mt-2">
                        <Link2 className="w-3 h-3" /> Reference
                      </a>
                    )}
                  </section>
                )}

                {/* What came back */}
                <section className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    What was handed in
                  </p>
                  {selected.deliveries.length === 0 ? (
                    <p className="text-sm text-gray-400">Submitted with no attachment.</p>
                  ) : selected.deliveries.map((d) => (
                    <div key={d.id} className="space-y-2">
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{d.deliveredBy?.name ?? "Someone"}</span>
                        <span className="text-gray-500"> submitted{d.method ? ` via ${d.method.toLowerCase().replace("_", " ")}` : ""}</span>
                      </p>
                      {d.remarks && <p className="text-sm text-gray-600 italic">{d.remarks}</p>}
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline break-all">
                          <Link2 className="w-3.5 h-3.5 flex-shrink-0" /> {d.url}
                        </a>
                      )}
                      {d.file && (
                        <a href={d.file.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                          <Paperclip className="w-3.5 h-3.5" /> {d.file.name}
                        </a>
                      )}
                    </div>
                  ))}
                </section>

                <div className="flex items-center gap-2.5">
                  <Button onClick={() => decide(selected, "APPROVED")} loading={busy}
                    icon={<CheckCircle2 className="w-4 h-4" />}>
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setChangesFor(selected)} disabled={busy}
                    icon={<AlertCircle className="w-4 h-4" />}>
                    Request changes
                  </Button>
                  {selected.project && (
                    <Link href={`/projects/${selected.project.id}?task=${selected.id}`}
                      className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600">
                      Open in project <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {changesFor && (
        <RequestChangesDialog
          taskTitle={changesFor.title}
          onCancel={() => setChangesFor(null)}
          onSubmit={async (comments) => {
            const task = changesFor;
            setChangesFor(null);
            setBusy(true);
            try {
              const res = await fetch(`/api/tasks/${task.id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision: "CHANGES_REQUESTED", comments }),
              });
              if (!res.ok) {
                const d = await res.json().catch(() => null);
                toast.error(d?.error?.message ?? "Couldn't send that back");
                return;
              }
              toast.success(`Sent back to ${task.assignees[0]?.user.name ?? "the assignee"}`);
              setSelectedId(null);
              await fetchQueue();
              broadcastChange("all");
            } finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <RequireCapability capability="tasks.review" what="Approvals">
      <ApprovalsInner />
    </RequireCapability>
  );
}
