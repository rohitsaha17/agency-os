"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";

function NewQuotationContent() {
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

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" /></div>}>
      <NewQuotationContent />
    </Suspense>
  );
}
