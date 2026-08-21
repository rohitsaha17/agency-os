"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, CheckCircle2, Clock, Circle, Edit3,
  FileText, Users, Calendar, DollarSign, Trash2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@/lib/format";
import type { Contract, ContractStatus, ContractType } from "@/types";

const TYPE_LABELS: Record<ContractType, string> = {
  NDA: "NDA", SERVICE_AGREEMENT: "Service Agreement", EMPLOYMENT: "Employment",
  FREELANCE: "Freelance", PARTNERSHIP: "Partnership", OTHER: "Other",
};

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-gray-100 text-gray-600" },
  SENT: { label: "Sent", color: "bg-blue-50 text-blue-700" },
  PARTIALLY_SIGNED: { label: "Partially Signed", color: "bg-amber-50 text-amber-700" },
  FULLY_SIGNED: { label: "Fully Signed", color: "bg-emerald-50 text-emerald-700" },
  EXPIRED: { label: "Expired", color: "bg-orange-50 text-orange-700" },
  TERMINATED: { label: "Terminated", color: "bg-red-50 text-red-700" },
};

const PARTY_TYPE_COLORS: Record<string, string> = {
  CLIENT:      "bg-sky-50 text-sky-700",
  STAKEHOLDER: "bg-purple-50 text-purple-700",
  USER:        "bg-indigo-50 text-indigo-700",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(v: number | null, currency: string) {
  if (!v) return null;
  return formatMoney(v, currency);
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast   = useToast();
  const confirm = useConfirm();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [signModal, setSignModal] = useState<{ open: boolean; partyId: string; partyName: string } | null>(null);
  const [signNote, setSignNote] = useState("");
  const [signing, setSigning] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<ContractStatus>("DRAFT");

  const fetchContract = async () => {
    const res = await fetch(`/api/contracts/${id}`);
    if (res.ok) setContract(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchContract(); }, [id]);

  const handleSign = async () => {
    if (!signModal) return;
    const ok = await confirm({
      title: "Record signature?",
      message: `Mark ${signModal.partyName} as having signed this contract. Once all parties have signed the contract becomes fully signed.`,
      confirmLabel: "Confirm Signature",
      variant: "info",
    });
    if (!ok) return;
    setSigning(true);
    const res = await fetch(`/api/contracts/${id}/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyId: signModal.partyId, signatureNote: signNote }),
    });
    if (res.ok) {
      setContract(await res.json());
      toast.success(`${signModal.partyName} marked as signed`);
    } else {
      toast.error("Failed to record signature");
    }
    setSigning(false);
    setSignModal(null);
    setSignNote("");
  };

  const handleUnsign = async (partyId: string) => {
    const ok = await confirm({
      title: "Remove signature?",
      message: "This will reset the party's signature status.",
      confirmLabel: "Remove",
      variant: "warning",
    });
    if (!ok) return;
    const res = await fetch(`/api/contracts/${id}/sign`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyId }),
    });
    if (res.ok) setContract(await res.json());
    else toast.error("Failed to remove signature");
  };

  const handleStatusUpdate = async () => {
    // Irreversible-ish transitions — confirm before activating / terminating.
    const irreversible: ContractStatus[] = ["FULLY_SIGNED", "TERMINATED", "EXPIRED"];
    if (irreversible.includes(newStatus) && contract?.status !== newStatus) {
      const ok = await confirm({
        title: `Set status to ${STATUS_CONFIG[newStatus].label}?`,
        message: newStatus === "FULLY_SIGNED"
          ? "Activating the contract locks it as fully executed."
          : `Marking this contract as ${STATUS_CONFIG[newStatus].label.toLowerCase()} is typically not reversed.`,
        confirmLabel: "Confirm",
        variant: newStatus === "TERMINATED" ? "danger" : "warning",
      });
      if (!ok) return;
    }

    const res = await fetch(`/api/contracts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setContract(await res.json());
      setStatusOpen(false);
      toast.success("Status updated");
    } else {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete contract?",
      message: "This contract and all party information will be permanently deleted.",
      confirmLabel: "Delete Contract",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    toast.success("Contract deleted");
    window.location.href = "/contracts";
  };

  const handleDownloadPdf = async () => {
    if (!contract) return;
    setPdfLoading(true);
    try {
      const [{ fetchSettings, openPrintPdf }, { buildContractHtml }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdfTemplates"),
      ]);
      const settings = await fetchSettings();
      const html = buildContractHtml({
        title:     contract.title,
        type:      contract.type,
        status:    contract.status,
        startDate: contract.startDate,
        endDate:   contract.endDate,
        value:     contract.value != null ? Number(contract.value) : null,
        currency:  contract.currency,
        notes:     contract.notes,
        project:   contract.project ?? null,
        client:    contract.client ?? null,
        parties: contract.parties.map((p) => ({
          name:          p.name,
          email:         p.email,
          partyType:     p.partyType,
          signedAt:      p.signedAt,
          signatureNote: p.signatureNote,
        })),
      }, settings);
      await openPrintPdf(html);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-64" />
    </div>
  );

  if (!contract) return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
      <p className="text-sm text-gray-500">Contract not found</p>
      <Link href="/contracts" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to Contracts</Link>
    </div>
  );

  const signedCount = contract.parties.filter((p) => p.signedAt).length;
  const cfg = STATUS_CONFIG[contract.status];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/contracts" className="hover:text-gray-800 transition-colors">Contracts</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium truncate">{contract.title}</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{contract.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{TYPE_LABELS[contract.type]}</span>
            </div>
            <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
              {contract.project && (
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <Link href={`/projects/${contract.project.id}`} className="text-indigo-600 hover:underline">{contract.project.name}</Link>
                </span>
              )}
              {contract.client && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <Link href={`/clients/${contract.client.id}`} className="text-indigo-600 hover:underline">{contract.client.name}</Link>
                </span>
              )}
              {(contract.startDate || contract.endDate) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(contract.startDate)} → {formatDate(contract.endDate)}
                </span>
              )}
              {contract.value && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  {formatCurrency(contract.value, contract.currency)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary" size="sm"
              icon={pdfLoading ? undefined : <Download className="w-3.5 h-3.5" />}
              loading={pdfLoading}
              onClick={handleDownloadPdf}
            >
              {pdfLoading ? "Generating…" : "PDF"}
            </Button>
            <Button variant="secondary" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}
              onClick={() => { setNewStatus(contract.status); setStatusOpen(true); }}
            >
              Update Status
            </Button>
            <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <div className="max-w-3xl space-y-6">
          {/* Signature progress */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Signing Status</h3>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                signedCount === contract.parties.length && contract.parties.length > 0
                  ? "bg-emerald-50 text-emerald-700"
                  : signedCount > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
              }`}>
                {signedCount}/{contract.parties.length} signed
              </span>
            </div>

            {/* Progress bar */}
            {contract.parties.length > 0 && (
              <div className="mb-5">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${(signedCount / contract.parties.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {contract.parties.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No parties added</p>
            ) : (
              <div className="space-y-3">
                {contract.parties.map((party) => (
                  <div key={party.id} className="flex items-start sm:items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                        {initials(party.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{party.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PARTY_TYPE_COLORS[party.partyType]}`}>
                            {party.partyType === "USER" ? "Internal" : party.partyType.charAt(0) + party.partyType.slice(1).toLowerCase()}
                          </span>
                        </div>
                        {party.email && <p className="text-xs text-gray-400">{party.email}</p>}
                        {party.signedAt && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Signed {formatDate(party.signedAt)}
                            {party.signatureNote && ` · ${party.signatureNote}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {party.signedAt ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <button onClick={() => handleUnsign(party.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <Circle className="w-5 h-5 text-gray-300" />
                          <Button size="sm" variant="secondary"
                            onClick={() => setSignModal({ open: true, partyId: party.id, partyName: party.name })}
                          >
                            Mark Signed
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {contract.notes && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mark Signed Modal */}
      {signModal?.open && (
        <Modal open title={`Mark ${signModal.partyName} as Signed`} onClose={() => setSignModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Confirm that <strong>{signModal.partyName}</strong> has signed this contract.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Signature Note (optional)</label>
              <input value={signNote} onChange={(e) => setSignNote(e.target.value)}
                placeholder="e.g. Signed via email / in-person on Apr 4"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setSignModal(null)}>Cancel</Button>
              <Button loading={signing} onClick={handleSign} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                Confirm Signature
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Status Update Modal */}
      {statusOpen && (
        <Modal open title="Update Contract Status" onClose={() => setStatusOpen(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(STATUS_CONFIG) as [ContractStatus, typeof STATUS_CONFIG[ContractStatus]][]).map(([s, cfg]) => (
                <button key={s} onClick={() => setNewStatus(s)}
                  className={`p-3 rounded-xl border-2 text-sm font-medium text-left transition-colors ${
                    newStatus === s ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-1 ${cfg.color}`}>{cfg.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStatusOpen(false)}>Cancel</Button>
              <Button onClick={handleStatusUpdate}>Update Status</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
