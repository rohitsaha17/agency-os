import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-errors";
import { getFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/files/[id]/download — the authenticated way to fetch a file's bytes.
 *
 * QA-005: uploads live in a bucket with permanent, guessable-adjacent public
 * URLs, and the app handed those URLs straight to the browser as the render/
 * download path — so a file's contents were reachable by anyone with the link,
 * with no auth and no tenant check. This route is the primary path instead: it
 * proves the caller is signed in AND that the file belongs to their org (a
 * foreign file is a 404, the same shape as every other cross-tenant lookup),
 * then streams the bytes through the server. The raw storage URL is never the
 * app's primary path.
 *
 * `?dl=1` forces a download (attachment); otherwise the browser may render it
 * inline, which is what image previews and PDFs want.
 *
 * NOTE (residual, documented for Phase 1): while the underlying bucket stays
 * public, the object is still directly fetchable by its storage key outside
 * this route. Making the bucket private + issuing short-lived signed URLs is
 * the follow-up that closes that; this route is the app-side half.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true, mimeType: true, s3Key: true },
    });
    if (!file) throw new ApiError("File not found", 404);

    // ?v=<versionId> serves that specific version, scoped to this file so a
    // foreign version id can't be fetched. Otherwise the current file object.
    const versionId = new URL(req.url).searchParams.get("v");
    let key = file.s3Key;
    if (versionId) {
      const version = await prisma.fileVersion.findFirst({
        where: { id: versionId, fileId: file.id },
        select: { s3Key: true },
      });
      if (!version) throw new ApiError("File version not found", 404);
      key = version.s3Key;
    }

    const stored = await getFile(key);
    if (!stored) throw new ApiError("File contents are no longer available", 404);

    const contentType = file.mimeType || stored.contentType || "application/octet-stream";
    const dl = new URL(req.url).searchParams.get("dl") === "1";
    // Quote the filename and strip control/quote chars so the header is safe.
    const safeName = file.name.replace(/["\r\n]/g, "_");
    const disposition = `${dl ? "attachment" : "inline"}; filename="${safeName}"`;

    return new NextResponse(new Uint8Array(stored.body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(stored.body.length),
        // Never let a shared/CDN cache hold a tenant-scoped file.
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/files/[id]/download");
  }
}
