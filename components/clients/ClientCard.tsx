import Link from "next/link";
import { Building2, Mail, Phone, FolderOpen, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { ClientSummary } from "@/types";

interface ClientCardProps {
  client: ClientSummary;
}

export function ClientCard({ client }: ClientCardProps) {
  const primaryContact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
  const initials = client.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link href={`/clients/${client.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {client.logoUrl ? (
              <img
                src={client.logoUrl}
                alt={client.name}
                className="w-10 h-10 rounded-lg object-contain border border-gray-100"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <span className="text-xs font-bold text-indigo-600">{initials}</span>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight">
                {client.name}
              </h3>
              {client.companyName && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {client.companyName}
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
          {primaryContact && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{primaryContact.name}{primaryContact.jobTitle ? ` · ${primaryContact.jobTitle}` : ""}</span>
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
