"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";
import { toast } from "@/lib/toast";

interface Created { name: string; email: string; role: string; setupPath: string }
interface ImportResult {
  created: Created[];
  skipped: number;
  total: number;
  errors: { row: number; email: string; message: string }[];
}

const ROLE_LABEL: Record<string, string> = {
  TEAM: "Team", SMM: "SMM", MANAGER: "Manager", ADMIN: "Admin",
};

export function TeamImportDialog({
  open, onClose, onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const reset = () => { setFile(null); setResult(null); setBusy(false); setCopiedEmail(null); };
  const close = () => { reset(); onClose(); };

  const fullLink = (path: string) =>
    (typeof window !== "undefined" ? window.location.origin : "") + path;

  const copyOne = async (c: Created) => {
    try {
      await navigator.clipboard.writeText(fullLink(c.setupPath));
      setCopiedEmail(c.email);
      setTimeout(() => setCopiedEmail((e) => (e === c.email ? null : e)), 1500);
    } catch { toast.error("Couldn't copy"); }
  };

  const copyAll = async (created: Created[]) => {
    const text = created.map((c) => `${c.name} <${c.email}>: ${fullLink(c.setupPath)}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast.success("All invite links copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/users/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error || "Import failed"); setBusy(false); return; }
      setResult(data as ImportResult);
      const n = data.created?.length ?? 0;
      if (n > 0) { toast.success(`${n} teammate${n === 1 ? "" : "s"} invited`); onImported(); }
      else if ((data.skipped ?? 0) > 0 && (data.errors?.length ?? 0) === 0) {
        toast.success("Nothing new — all of those already have accounts");
      }
    } catch { toast.error("Import failed"); }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk invite teammates"
      footer={
        result ? (
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={!file || busy} loading={busy} icon={<Upload className="w-4 h-4" />}>
              Import
            </Button>
          </div>
        )
      }
    >
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Invite many teammates at once. Download the template, fill one person
            per row, then upload it back. Each new teammate gets an invite link
            to set their password — you'll get those links here to share.
          </p>

          <a
            href="/api/users/import/template"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            <Download className="w-4 h-4" /> Download the Excel template
          </a>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
              Upload the filled sheet
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); }}
              className="block w-full text-sm text-gray-600 dark:text-slate-300
                         file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2
                         file:text-sm file:font-medium file:text-indigo-700
                         hover:file:bg-indigo-100 dark:file:bg-indigo-500/15 dark:file:text-indigo-300"
            />
            {file && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> {file.name}
              </p>
            )}
          </div>

          <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
            Accepts .xlsx or .csv. <b>Name</b> and <b>Email</b> are required. Access level is
            Team unless set to SMM, Manager or Admin. An email that already has an account is
            skipped, so re-uploading won't create duplicates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>
              <b>{result.created.length}</b> teammate{result.created.length === 1 ? "" : "s"} invited
              {result.skipped > 0 && <>, <b>{result.skipped}</b> skipped (already had accounts)</>}.
            </span>
          </div>

          {result.created.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-white/[0.08]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                  Invite links — share each with the person
                </p>
                <button
                  onClick={() => copyAll(result.created)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy all
                </button>
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-white/[0.06]">
                {result.created.map((c) => (
                  <li key={c.email} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-slate-200 truncate">
                        {c.name} <span className="text-gray-400">· {ROLE_LABEL[c.role] ?? c.role}</span>
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{c.email}</p>
                    </div>
                    <button
                      onClick={() => copyOne(c)}
                      className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded-md border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] inline-flex items-center gap-1"
                    >
                      {copiedEmail === c.email
                        ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copied</>
                        : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
              </p>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-[11px] text-amber-800 dark:text-amber-300/90">
                    Row {e.row}{e.email ? ` (${e.email})` : ""}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
