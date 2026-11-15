import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { getFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/users/[id]/avatar — stream a person's profile photo.
 *
 * Same posture as the file-download route: the photo lives in storage under a
 * non-public key, and the bytes are served only through the server after
 * proving the caller is signed in and the person is in their org. A colleague's
 * photo is shown all over the app (the sidebar, lists, the team pages), so any
 * signed-in member of the same organization may fetch it — but nobody outside.
 *
 * `avatarUrl` on the user row points here with a `?v=` cache-buster that changes
 * on every upload, so a new photo shows at once while the old URL could be
 * cached. No photo set → 404, which the UI reads as "fall back to initials".
 */
function contentTypeFor(key: string): string {
  const ext = key.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const target = await prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { avatarKey: true },
    });
    if (!target?.avatarKey) throw new ApiError("No photo set", 404);

    const stored = await getFile(target.avatarKey);
    if (!stored) throw new ApiError("Photo is no longer available", 404);

    return new NextResponse(new Uint8Array(stored.body), {
      status: 200,
      headers: {
        "Content-Type": stored.contentType || contentTypeFor(target.avatarKey),
        "Content-Length": String(stored.body.length),
        // Safe to cache: the URL carries a ?v that changes when the photo does,
        // and it is per-viewer (private), never a shared/CDN copy.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/users/[id]/avatar");
  }
}
