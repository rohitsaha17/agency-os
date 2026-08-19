import { ClientStatus, ProjectStatus } from "@/types";

const statusStyles: Record<string, string> = {
  // Client statuses
  PROSPECT: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  ACTIVE: "bg-green-50 text-green-700 ring-1 ring-green-200",
  INACTIVE: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  ARCHIVED: "bg-red-50 text-red-600 ring-1 ring-red-200",
  // Project statuses
  DRAFT: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  ON_HOLD: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 ring-1 ring-red-200",
  // Task statuses
  TODO: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  IN_REVIEW: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  BLOCKED: "bg-red-50 text-red-600 ring-1 ring-red-200",
  // Invoice / content statuses
  SENT: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-600 ring-1 ring-red-200",
  EXPIRED: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
};

const statusLabels: Record<string, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
  DRAFT: "Draft",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  BLOCKED: "Blocked",
};

interface BadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: BadgeProps) {
  const styles = statusStyles[status as ClientStatus] ?? "bg-gray-100 text-gray-600";
  const label = statusLabels[status] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles} ${className}`}>
      {label}
    </span>
  );
}
