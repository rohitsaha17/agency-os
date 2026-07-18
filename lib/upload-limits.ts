import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";

/**
 * Default upload storage quota for a whole ORGANIZATION, in bytes.
 * The actual cap per org is `Organization.uploadLimitMb` (set by the
 * platform admin); this is only the fallback when that isn't set.
 */
export const DEFAULT_ORG_UPLOAD_MB = 200;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Throw ApiError(413) if this upload would push the ORGANIZATION over its
 * total storage quota. All files in the org count toward the same cap.
 */
export async function assertUploadWithinQuota(organizationId: string, newBytes: number): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { uploadLimitMb: true },
  });
  const limitMb = org?.uploadLimitMb ?? DEFAULT_ORG_UPLOAD_MB;
  const limitBytes = limitMb * 1024 * 1024;

  if (newBytes > limitBytes) {
    throw new ApiError(`File is too large. Your workspace limit is ${mb(limitBytes)}.`, 413);
  }

  const agg = await prisma.file.aggregate({
    where: { organizationId },
    _sum: { size: true },
  });
  const used = agg._sum.size ?? 0;
  if (used + newBytes > limitBytes) {
    const remaining = Math.max(0, limitBytes - used);
    throw new ApiError(
      `Upload exceeds your workspace's ${mb(limitBytes)} storage limit — ${mb(remaining)} remaining. Delete some files or ask your admin to raise the limit.`,
      413
    );
  }
}
