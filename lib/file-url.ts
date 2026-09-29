/**
 * Build the URL the app uses to render or download a stored file.
 *
 * QA-005: the app used to hand the browser the file's raw storage URL — a
 * permanent, public, guessable-adjacent link with no auth or tenant check.
 * Every image `src` and download `href` should point here instead, at the
 * authenticated, org-scoped route in app/api/files/[id]/download.
 *
 * Client-safe: a pure string builder, no server imports.
 */
export function fileHref(
  fileId: string,
  opts?: { download?: boolean; versionId?: string },
): string {
  const params = new URLSearchParams();
  if (opts?.versionId) params.set("v", opts.versionId);
  if (opts?.download) params.set("dl", "1");
  const qs = params.toString();
  return `/api/files/${fileId}/download${qs ? `?${qs}` : ""}`;
}
