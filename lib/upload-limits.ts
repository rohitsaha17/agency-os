import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-errors";

/**
 * Per-user upload storage quota. Every file a user uploads counts toward
 * this cap (summed from File.size). Kept intentionally low for now.
 */
export const MAX_USER_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

/** Hard per-file ceiling (can't exceed the per-user total anyway). */
export const MAX_FILE_BYTES = MAX_USER_UPLOAD_BYTES;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Throw ApiError(413) if this upload would push the user over their quota,
 * or if the single file exceeds the per-file ceiling.
 */
export async function assertUploadWithinQuota(userId: string, newBytes: number): Promise<void> {
  if (newBytes > MAX_FILE_BYTES) {
    throw new ApiError(`File is too large. Maximum ${mb(MAX_FILE_BYTES)} per file.`, 413);
  }
  const agg = await prisma.file.aggregate({
    where: { uploadedById: userId },
    _sum: { size: true },
  });
  const used = agg._sum.size ?? 0;
  if (used + newBytes > MAX_USER_UPLOAD_BYTES) {
    const remaining = Math.max(0, MAX_USER_UPLOAD_BYTES - used);
    throw new ApiError(
      `Upload exceeds your ${mb(MAX_USER_UPLOAD_BYTES)} storage limit — ${mb(remaining)} remaining. Delete some files and try again.`,
      413
    );
  }
}
