import type { Priority } from "@/types";

const styles: Record<Priority, string> = {
  LOW: "bg-gray-100 text-gray-500",
  MEDIUM: "bg-blue-50 text-blue-600",
  HIGH: "bg-orange-50 text-orange-600",
  URGENT: "bg-red-50 text-red-600 font-semibold",
};

const dots: Record<Priority, string> = {
  LOW: "bg-gray-400",
  MEDIUM: "bg-blue-500",
  HIGH: "bg-orange-500",
  URGENT: "bg-red-500",
};

const labels: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PriorityBadge({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  if (compact) {
    return (
      <span title={labels[priority]} className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dots[priority]}`} />
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${styles[priority]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[priority]}`} />
      {labels[priority]}
    </span>
  );
}
