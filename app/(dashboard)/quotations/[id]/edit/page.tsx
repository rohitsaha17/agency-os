"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import type { Quotation, QuotationFormData } from "@/types";

export default function EditQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/quotations/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.id) setQuotation(d); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-sm text-gray-500">Quotation not found</p>
        <Link href="/quotations" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to Quotations
        </Link>
      </div>
    );
  }

  // Map DB model → form data shape
  const initialData: Partial<QuotationFormData> = {
    clientId: quotation.clientId,
    title: quotation.title,
    description: quotation.description ?? "",
    pricingType: quotation.pricingType,
    validUntil: quotation.validUntil ? quotation.validUntil.slice(0, 10) : "",
    currency: quotation.currency,
    discountType: quotation.discountType ?? "",
    discountValue: String(quotation.discountValue ?? 0),
    taxRate: String(quotation.taxRate ?? 0),
    notes: quotation.notes ?? "",
    terms: quotation.terms ?? "",
    lineItems: quotation.lineItems.map((item) => ({
      id: item.id,
      rateCardId: item.rateCardId ?? "",
      title: item.title,
      description: item.description ?? "",
      pricingType: item.pricingType,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      unit: item.unit ?? "",
    })),
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/quotations" className="hover:text-gray-800 transition-colors">Quotations</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href={`/quotations/${id}`} className="hover:text-gray-800 transition-colors truncate max-w-48">
            {quotation.title}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">Edit</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Edit Quotation</h1>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <QuotationBuilder
            quotationId={id}
            initialData={initialData}
            onSuccess={() => router.push(`/quotations/${id}`)}
          />
        </div>
      </div>
    </div>
  );
}
