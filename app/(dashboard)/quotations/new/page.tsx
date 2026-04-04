"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";

export default function NewQuotationPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-shrink-0">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/quotations" className="hover:text-gray-800 transition-colors">Quotations</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">New Quotation</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Create Quotation</h1>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <QuotationBuilder initialData={clientId ? { clientId } : undefined} />
        </div>
      </div>
    </div>
  );
}
