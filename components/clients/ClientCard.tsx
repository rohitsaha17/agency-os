import Link from "next/link";
import { Building2, Mail, Phone, FolderOpen, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { ClientSummary } from "@/types";

interface ClientCardProps {
  client: ClientSummary;
}

export function ClientCard({ client }: ClientCardProps) {
  const primaryContact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
  // Heading should always be the company name. Fall back to legacy `name`
  // for older records created before the company-first form.
  const displayName = client.companyName?.trim() || client.name;

  return (
    <Link href={`/clients/${client.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {client.logoUrl ? (
              // object-contain + p-1 + bg-white prevents cropping and gives
              // transparent logos a clean canvas. The square box stays the
              // same size; the logo scales to fit inside it.
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 p-1 overflow-hidden">
                <img
                  src={client.logoUrl}
                  alt={displayName}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight truncate">
                {displayName}
              </h3>
              {primaryContact && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    {primaryContact.name}
                    {primaryContact.jobTitle ? ` · ${primaryContact.jobTitle}` : ""}
                  </span>
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={client.status} />
        </div>

        {/* Details */}
        <div className="space-y-1.5 mb-4">
          {client.email && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{client.email}</span>
            </p>
          )}
          {client.phone && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              {client.phone}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          {client.industry && (
            <span className="text-xs text-gray-400">{client.industry}</span>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
            <FolderOpen className="w-3.5 h-3.5" />
            {client._count.projects} project{client._count.projects !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </Link>
  );
}
