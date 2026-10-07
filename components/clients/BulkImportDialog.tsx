"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";

interface ImportResult {
  created: number;
  skipped: number;
  total: number;
  errors: { row: number; company: string; message: string }[];
}

export function BulkImportDialog({
  open, onClose, onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/clients/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Import failed");
        setBusy(false);
        return;
      }
      setResult(data as ImportResult);
      if ((data.created ?? 0) > 0) {
        toast.success(`${data.created} client${data.created === 1 ? "" : "s"} imported`);
        onImported();
      } else if ((data.skipped ?? 0) > 0 && (data.errors?.length ?? 0) === 0) {
        toast.success("Nothing new to import — all of those already exist");
      }
    } catch {
      toast.error("Import failed");
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk import clients"
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
            Add many clients at once from a spreadsheet. Download the template,
            fill one client per row, then upload it back.
          </p>

          {/* Step 1 — template */}
          <a
            href="/api/clients/import/template"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            <Download className="w-4 h-4" /> Download the Excel template
          </a>

          {/* Step 2 — upload */}
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
            Accepts .xlsx or .csv. <b>Company Name</b> and <b>Primary Contact Name</b> are
            required on every row. A client whose company name already exists is skipped,
            so re-uploading the same sheet won't create duplicates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>
              <b>{result.created}</b> client{result.created === 1 ? "" : "s"} imported
              {result.skipped > 0 && <>, <b>{result.skipped}</b> skipped (already existed)</>}.
            </span>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
              </p>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-[11px] text-amber-800 dark:text-amber-300/90">
                    Row {e.row}{e.company ? ` (${e.company})` : ""}: {e.message}
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
