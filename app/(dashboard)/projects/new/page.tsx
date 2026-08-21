"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { RequireCapability } from "@/components/layout/RequireCapability";

function NewProjectContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/projects" className="hover:text-gray-800 transition-colors">Projects</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">New Project</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Create Project</h1>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-2xl">
        <ProjectForm defaultClientId={clientId} />
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  // The button is hidden for anyone below SMM, but the URL is still typeable —
  // without this they'd fill in the whole form and meet a 403 on save.
  return (
    <RequireCapability capability="content.plan" what="Creating a project">
      <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" /></div>}>
        <NewProjectContent />
      </Suspense>
    </RequireCapability>
  );
}
