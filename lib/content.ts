import { prisma } from "@/lib/prisma";
import { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api-errors";

/** Default creative-type catalog seeded for every org on first use. */
export const DEFAULT_CREATIVE_TYPES = [
  { name: "Post",        slug: "post",        icon: "🖼️", color: "#6366f1", countsAsShoot: false },
  { name: "Carousel",    slug: "carousel",    icon: "🎠", color: "#8b5cf6", countsAsShoot: false },
  { name: "Reel",        slug: "reel",        icon: "🎬", color: "#ec4899", countsAsShoot: false },
  { name: "Story",       slug: "story",       icon: "⏱️", color: "#f59e0b", countsAsShoot: false },
  { name: "Video",       slug: "video",       icon: "📹", color: "#ef4444", countsAsShoot: false },
  { name: "Photo Shoot", slug: "photo-shoot", icon: "📸", color: "#10b981", countsAsShoot: true },
  { name: "Blog",        slug: "blog",        icon: "📝", color: "#0ea5e9", countsAsShoot: false },
  { name: "Other",       slug: "other",       icon: "✨", color: "#64748b", countsAsShoot: false },
] as const;

/** Return the org's creative types, seeding the default catalog on first use. */
export async function ensureCreativeTypes(organizationId: string) {
  const existing = await prisma.creativeType.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });
  if (existing.length > 0) return existing;
  await prisma.creativeType.createMany({
    data: DEFAULT_CREATIVE_TYPES.map((t, i) => ({
      organizationId,
      name: t.name,
      slug: t.slug,
      icon: t.icon,
      color: t.color,
      countsAsShoot: t.countsAsShoot,
      sortOrder: i,
    })),
  });
  return prisma.creativeType.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });
}

export type ContentStatusValue =
  | "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "IN_REVIEW"
  | "TEAM_APPROVED" | "CLIENT_APPROVED" | "SCHEDULED" | "POSTED" | "MISSED";

export const CONTENT_PIPELINE: ContentStatusValue[] = [
  "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_REVIEW",
  "TEAM_APPROVED", "CLIENT_APPROVED", "SCHEDULED", "POSTED",
];

/**
 * Who may perform which transition (docs/V2_CONTEXT.md §4):
 * - TEAM_APPROVED: managers / HEAD_OF_DESIGN / admins
 * - CLIENT_APPROVED (manual): SMM / POC designations / admins
 * - other forward moves + MISSED: any member of the org
 * Throws ApiError(403) when not allowed.
 */
export function assertTransitionAllowed(user: AuthUser, to: ContentStatusValue): void {
  const isAdmin = user.role === "ADMIN" || user.role === "OWNER";
  if (to === "TEAM_APPROVED") {
    const ok = isAdmin || user.role === "MANAGER" || user.designation === "HEAD_OF_DESIGN";
    if (!ok) throw new ApiError("Only managers, the Head of Design, or admins can team-approve", 403);
  }
  if (to === "CLIENT_APPROVED") {
    const ok = isAdmin || user.designation === "SMM" || user.designation === "POC";
    if (!ok) throw new ApiError("Only the SMM, POC, or an admin can mark client approval", 403);
  }
}

/** Timestamp side-effects of a transition. */
export function transitionTimestamps(to: ContentStatusValue) {
  const now = new Date();
  return {
    ...(to === "TEAM_APPROVED" && { teamApprovedAt: now }),
    ...(to === "CLIENT_APPROVED" && { clientApprovedAt: now }),
    ...(to === "POSTED" && { postedAt: now }),
  };
}
