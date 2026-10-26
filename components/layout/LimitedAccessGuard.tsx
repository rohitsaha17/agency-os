"use client";

/**
 * Turns a limited-access user (shoot crew) away from modules they don't have.
 *
 * The rail already hides those links, but a link is not a lock: a bookmark, a
 * stale notification or a typed URL would still open /projects for a
 * photographer. This closes that — on any path outside their allowlist it sends
 * them to Tasks. It is UI scoping, not data security (the pages' own role rules
 * still decide what any request may read); it just keeps the app to the few
 * modules these users actually work in.
 *
 * Mounted once in the dashboard layout, so it covers every page without each
 * one having to opt in. Renders nothing.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isLimitedAccess, limitedAccessAllows } from "@/lib/permissions";

export function LimitedAccessGuard() {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user || !pathname) return;
    if (isLimitedAccess(user) && !limitedAccessAllows(pathname)) {
      router.replace("/tasks");
    }
  }, [user, pathname, router]);

  return null;
}
