"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Edit3, Send, CheckCircle2, XCircle,
  ArrowRight, FileText, Calendar, DollarSign,
  FolderKanban, AlertCircle, Download,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConvertModal } from "@/components/quotations/ConvertModal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@/lib/format";
import type { Quotation, QuotationStatus } from "@/types";

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string }> = {
  DRAFT:     { label: "Draft",     color: "bg-gray-100 text-gray-700" },
  SENT:      { label: "Sent",      color: "bg-blue-50 text-blue-700" },
  APPROVED:  { label: "Approved",  color: "bg-emerald-50 text-emerald-700" },
  REJECTED:  { label: "Rejected",  color: "bg-red-50 text-red-700" },
  EXPIRED:   { label: "Expired",   color: "bg-yellow-50 text-yellow-700" },
  CONVERTED: { label: "Converted", color: "bg-indigo-50 text-indigo-700" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function QuotationDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const toast   = useToast();
  const confirm = useConfirm();
  const id = params.id as string;

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchQuotation = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Not found");
      setQuotation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchQuotation(); }, [fetchQuotation]);

  const handleStatusChange = async (status: QuotationStatus) => {
    // Irreversible-ish status transitions — require explicit confirmation.
    const confirmCopy: Partial<Record<QuotationStatus, { title: string; message: string; confirmLabel: string; variant: "danger" | "warning" | "info" }>> = {
      SENT: {
        title: "Send quotation?",
        message: "Mark this quotation as sent to the client. You won't be able to edit it afterwards without reverting status.",
        confirmLabel: "Mark as Sent",
        variant: "info",
      },
      APPROVED: {
        title: "Approve quotation?",
        message: "Approving locks the quotation and allows conversion to a project.",
        confirmLabel: "Approve",
        variant: "info",
      },
      REJECTED: {
        title: "Reject quotation?",
        message: "This will mark the quotation as rejected. You can still reopen it later.",
        confirmLabel: "Reject",
        variant: "danger",
      },
    };
    const copy = confirmCopy[status];
    if (copy) {
      const ok = await confirm(copy);
      if (!ok) return;
    }

    setActionLoading(status);
    try {
      const res = status === "SENT"
        ? await fetch(`/api/quotations/${id}/send`, { method: "POST" })
        : await fetch(`/api/quotations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error?.message || "Failed to update quotation");
        return;
      }
      await fetchQuotation();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete quotation?",
      message: "This quotation and all its line items will be permanently deleted.",
      confirmLabel: "Delete Quotation",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/quotations/${id}`, { method: "DELETE" });
    toast.success("Quotation deleted");
    router.push("/quotations");
  };

  const handleDownloadPdf = async () => {
    if (!quotation) return;
    setPdfLoading(true);
    try {
      const [{ fetchSettings, openPrintPdf }, { buildQuotationHtml }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdfTemplates"),
      ]);
      const settings = await fetchSettings();
      const html = buildQuotationHtml({
        number:        quotation.number,
        title:         quotation.title,
        status:        quotation.status,
        pricingType:   quotation.pricingType,
        currency:      quotation.currency,
        createdAt:     quotation.createdAt,
        validUntil:    quotation.validUntil,
        description:   quotation.description,
        notes:         quotation.notes,
        terms:         quotation.terms,
        subtotal:      Number(quotation.subtotal),
        discountType:  quotation.discountType,
        discountValue: Number(quotation.discountValue ?? 0),
        taxRate:       Number(quotation.taxRate ?? 0),
        total:         Number(quotation.total),
        client:        quotation.client ?? null,
        lineItems:     quotation.lineItems.map((li) => ({
          title:       li.title,
          description: li.description,
          pricingType: li.pricingType,
          quantity:    Number(li.quantity),
          unitPrice:   Number(li.unitPrice),
          subtotal:    Number(li.subtotal),
          unit:        li.unit,
        })),
      }, settings);
      await openPrintPdf(html);
    } catch (err) {
      toast.error("Failed to generate PDF", err instanceof Error ? err.message : undefined);
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-3" />
          <div className="h-7 bg-gray-200 rounded w-72" />
        </div>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-sm text-gray-500">{error ?? "Quotation not found"}</p>
        <Link href="/quotations" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to Quotations
        </Link>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[quotation.status];
  const subtotal = Number(quotation.subtotal);
  const discountValue = Number(quotation.discountValue);
  const taxRate = Number(quotation.taxRate);
  const total = Number(quotation.total);

  const discountAmount =
    quotation.discountType === "PERCENT"
      ? (subtotal * discountValue) / 100
      : quotation.discountType === "AMOUNT"
      ? discountValue
      : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (afterDiscount * taxRate) / 100;

  const isExpired = quotation.validUntil && new Date(quotation.validUntil) < new Date();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/quotations" className="hover:text-gray-800 transition-colors">Quotations</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium truncate">{quotation.title}</span>
        </nav>

        <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{quotation.title}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
              <span className="font-mono">{quotation.number}</span>
              {quotation.client?.id && (
                <Link href={`/clients/${quotation.client.id}`} className="hover:text-indigo-600 transition-colors">
                  {quotation.client.name}{quotation.client.companyName && ` · ${quotation.client.companyName}`}
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Download PDF */}
            <Button
              variant="secondary" size="sm"
              icon={pdfLoading ? undefined : <Download className="w-3.5 h-3.5" />}
              loading={pdfLoading}
              onClick={handleDownloadPdf}
            >
              {pdfLoading ? "Generating…" : "PDF"}
            </Button>

            {/* Status actions */}
            {quotation.status === "DRAFT" && (
              <>
                <Button
                  variant="secondary" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}
                  onClick={() => router.push(`/quotations/${id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  size="sm" icon={<Send className="w-3.5 h-3.5" />}
                  loading={actionLoading === "SENT"}
                  onClick={() => handleStatusChange("SENT")}
                >
                  Mark as Sent
                </Button>
              </>
            )}
            {quotation.status === "SENT" && (
              <>
                <Button
                  variant="secondary" size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}
                  onClick={() => router.push(`/quotations/${id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary" size="sm" icon={<XCircle className="w-3.5 h-3.5" />}
                  loading={actionLoading === "REJECTED"}
                  onClick={() => handleStatusChange("REJECTED")}
                >
                  Reject
                </Button>
                <Button
                  size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  loading={actionLoading === "APPROVED"}
                  onClick={() => handleStatusChange("APPROVED")}
                >
                  Approve
                </Button>
              </>
            )}
            {quotation.status === "APPROVED" && !quotation.project && (
              <Button
                size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={() => setConvertOpen(true)}
              >
                Convert to Project
              </Button>
            )}
            {quotation.status === "CONVERTED" && quotation.project && (
              <Link href={`/projects/${quotation.project.id}`}>
                <Button variant="secondary" size="sm" icon={<FolderKanban className="w-3.5 h-3.5" />}>
                  View Project
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            Created {formatDate(quotation.createdAt)}
          </span>
          {quotation.validUntil && (
            <span className={`flex items-center gap-1.5 ${isExpired ? "text-red-500" : ""}`}>
              {isExpired && <AlertCircle className="w-3.5 h-3.5" />}
              {isExpired ? "Expired" : "Valid until"} {formatDate(quotation.validUntil)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
            {formatMoney(total, quotation.currency)} · {quotation.lineItems.length} item{quotation.lineItems.length !== 1 ? "s" : ""}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            quotation.pricingType === "RETAINER" ? "bg-purple-50 text-purple-700" :
            quotation.pricingType === "PER_ITEM" ? "bg-sky-50 text-sky-700" :
            "bg-gray-100 text-gray-600"
          }`}>
            {quotation.pricingType === "RETAINER" ? "Retainer" : quotation.pricingType === "PER_ITEM" ? "Per Item" : "Fixed Price"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Description */}
          {quotation.description && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Scope of Work</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.description}</p>
            </div>
          )}

          {/* Line items */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Services & Deliverables</h2>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3">Item</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 w-24">Type</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3 w-20">Qty</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3 w-28">Unit Price</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-6 py-3 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotation.lineItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <span className="text-xs text-gray-500">
                        {item.pricingType === "FIXED" ? "Fixed" : item.pricingType === "RETAINER" ? "Retainer/mo" : "Per Item"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right text-sm text-gray-600">
                      {item.pricingType !== "FIXED" ? `${Number(item.quantity)} ${item.unit || ""}`.trim() : "—"}
                    </td>
                    <td className="px-3 py-4 text-right text-sm text-gray-600">
                      {formatMoney(Number(item.unitPrice), quotation.currency)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatMoney(Number(item.subtotal), quotation.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="max-w-xs ml-auto space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal, quotation.currency)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>
                      Discount{quotation.discountType === "PERCENT" && ` (${discountValue}%)`}
                    </span>
                    <span>− {formatMoney(discountAmount, quotation.currency)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax ({taxRate}%)</span>
                    <span>{formatMoney(taxAmount, quotation.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-300">
                  <span>Total</span>
                  <span className="text-indigo-700">{formatMoney(total, quotation.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quotation.notes && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Notes</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.notes}</p>
            </div>
          )}

          {/* Terms */}
          {quotation.terms && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Terms & Conditions</h2>
              <p className="text-xs text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{quotation.terms}</p>
            </div>
          )}

          {/* Linked project */}
          {quotation.project && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-indigo-600 font-medium">Converted to Project</p>
                  <p className="text-sm font-semibold text-indigo-900">{quotation.project.name}</p>
                </div>
              </div>
              <Link href={`/projects/${quotation.project.id}`}>
                <Button variant="secondary" size="sm">Open Project</Button>
              </Link>
            </div>
          )}

          {/* Danger zone */}
          {(quotation.status === "DRAFT" || quotation.status === "REJECTED") && (
            <div className="border border-red-200 rounded-2xl p-5 flex items-center justify-between bg-red-50/50">
              <div>
                <p className="text-sm font-medium text-red-800">Delete Quotation</p>
                <p className="text-xs text-red-600 mt-0.5">This action cannot be undone.</p>
              </div>
              <button
                onClick={handleDelete}
                className="text-sm text-red-600 hover:text-red-800 font-medium border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Convert modal */}
      {convertOpen && (
        <ConvertModal quotation={quotation} onClose={() => setConvertOpen(false)} />
      )}
    </div>
  );
}
