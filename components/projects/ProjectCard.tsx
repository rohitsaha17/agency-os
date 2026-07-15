import Link from "next/link";
import { Calendar, CheckSquare } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import type { Project } from "@/types";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ProjectCardProps {
  project: Project & { progress: number };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const clientName = project.client?.name ?? "Unknown Client";
  const taskCount = project._count?.tasks ?? 0;
  const progressColor =
    project.progress >= 75 ? "bg-emerald-500" :
    project.progress >= 40 ? "bg-indigo-500" :
    "bg-gray-300";

  return (
    <Link href={`/projects/${project.id}`} className="block group">
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {project.client?.logoUrl ? (
              <img
                src={project.client.logoUrl}
                alt={clientName}
                className="w-8 h-8 rounded-lg object-contain border border-gray-100 bg-gray-50 p-0.5 flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {initials(clientName)}
              </div>
            )}
            <span className="text-xs text-gray-500 truncate">{clientName}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              project.type === "RETAINER"
                ? "bg-purple-50 text-purple-700 ring-1 ring-purple-200"
                : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
            }`}>
              {project.type === "RETAINER" ? "Retainer" : "One-Time"}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-indigo-700 transition-colors line-clamp-1">
          {project.name}
        </h3>
        {project.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{project.description}</p>
        )}

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Progress</span>
            <span className="text-xs font-medium text-gray-700">{project.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor}`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <StatusBadge status={project.status} />
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {taskCount > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {taskCount}
              </span>
            )}
            {(project.startDate || project.endDate) && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(project.endDate ?? project.startDate)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
