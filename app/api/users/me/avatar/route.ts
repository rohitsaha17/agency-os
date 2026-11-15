import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError, ApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { putFile, deleteFile, storageKey } from "@/lib/storage";

/**
 * Your own profile photo — the one thing in My Account that isn't just text.
 *
 * POST sets it (multipart, field name "file"); DELETE clears it. Only ever your
 * own: there is no [id] here, the subject is always the signed-in user. The
 * bytes go to storage under a random key; the row keeps that key (to serve and
 * to delete the old one) and an avatarUrl pointing at the authenticated serving
 * route with a fresh ?v so the new photo shows immediately.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — a photo, not a poster.
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `avatar:set:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError("Send the image as multipart form data", 400);
    }
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) throw new ApiError("No image was uploaded", 400);
    if (!OK_TYPES.has(file.type)) {
      throw new ApiError("That has to be a JPG, PNG, WebP or GIF image", 400);
    }
    if (file.size > MAX_BYTES) throw new ApiError("Keep the photo under 5 MB", 400);
    if (file.size === 0) throw new ApiError("That file is empty", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await putFile(storageKey(file.name || "avatar"), buffer, file.type);

    // The previous object, if any, so it can be cleaned up after the row points
    // at the new one. Looked up now rather than trusted from the client.
    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarKey: true },
    });

    const avatarUrl = `/api/users/${user.id}/avatar?v=${Date.now()}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: stored.key, avatarUrl },
    });

    if (prev?.avatarKey && prev.avatarKey !== stored.key) {
      await deleteFile(prev.avatarKey); // best-effort; never throws
    }

    return NextResponse.json({ avatarUrl }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/users/me/avatar");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const rl = checkRateLimit(req, `avatar:clear:${user.id}`, WRITE_RATE_LIMITS.light);
    if (!rl.allowed) return apiError("Too many requests, please slow down", 429);

    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarKey: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: null, avatarUrl: null },
    });
    if (prev?.avatarKey) await deleteFile(prev.avatarKey);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/users/me/avatar");
  }
}
