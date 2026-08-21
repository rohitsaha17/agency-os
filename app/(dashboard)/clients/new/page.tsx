import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ClientForm } from "@/components/clients/ClientForm";

export default function NewClientPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Clients
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">New Client</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Add a new client to your agency
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="max-w-2xl">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <ClientForm />
          </div>
        </div>
      </div>
    </div>
  );
}
