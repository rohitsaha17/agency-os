"use client";

/**
 * v3 — a page-level guard.
 *
 * The API is the real enforcement point and always will be; this exists so a
 * user who reaches a page they can't use sees a straight answer instead of a
 * shell full of failed requests (docs/V3_CONTEXT.md Prime Directive).
 */

import Link from "next/link";
import { Lock } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { can, type Capability } from "@/lib/permissions";

export function RequireCapability({
  capability, children, what,
}: {
  capability: Capability;
  children: React.ReactNode;
  /** What the page is, in words — used in the refusal message. */
  what?: string;
}) {
  const { user, loading } = useCurrentUser();

  // Don't flash a refusal while we still don't know who they are.
  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!can(user, capability)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Lock className="w-5 h-5 text-gray-400" />
        </div>
        <p className="text-base font-semibold text-gray-800">
          {what ?? "This page"} isn&rsquo;t part of your access
        </p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Your role doesn&rsquo;t include it. If you think it should, ask an admin —
          roles are managed in Settings.
        </p>
        <Link href="/"
          className="mt-5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
