/**
 * Where uploaded files actually live.
 *
 * The upload route used to write into `public/uploads/` with fs.writeFile.
 * That works on a laptop and cannot work on Vercel: a serverless function's
 * filesystem is read-only apart from /tmp, so every upload in production died
 * with `EROFS: read-only file system, open '/var/task/public/uploads/…'`.
 * Even /tmp would be wrong — it's wiped between invocations, so the file would
 * vanish while the database row claiming it existed stayed behind.
 *
 * So: Supabase Storage when it's configured, local disk when it isn't. Local
 * development keeps working with no setup; production gets durable storage.
 *
 * Uses the Storage REST API directly rather than @supabase/supabase-js — it's
 * two fetch calls, and this avoids adding a dependency and its bundle weight
 * to every serverless function.
 */
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

function remoteConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

/** True when uploads go to Supabase rather than the local filesystem. */
export function usingRemoteStorage(): boolean {
  return remoteConfig() !== null;
}

export interface StoredFile {
  /** Key we can delete by later. */
  key: string;
  /** URL the browser can load. */
  url: string;
}

/**
 * Store one file. `key` is a path within the bucket, e.g.
 * "uploads/1699…_brief.png".
 */
export async function putFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const cfg = remoteConfig();

  if (!cfg) {
    // Local dev: the same public/uploads behaviour as before.
    const dir = path.join(process.cwd(), "public", path.dirname(key));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(process.cwd(), "public", key), body);
    return { key, url: `/${key}` };
  }

  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": contentType || "application/octet-stream",
      // Overwrite rather than fail if the same key is retried.
      "x-upsert": "true",
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Upload failed (${res.status}). ${detail.slice(0, 200)} `
      + `Check that the "${BUCKET}" bucket exists in Supabase Storage and is public.`,
    );
  }

  return { key, url: `${cfg.url}/storage/v1/object/public/${BUCKET}/${key}` };
}

/** Best-effort removal. Never throws: a failed cleanup must not fail a request. */
export async function deleteFile(key: string): Promise<void> {
  const cfg = remoteConfig();
  try {
    if (!cfg) {
      await unlink(path.join(process.cwd(), "public", key));
      return;
    }
    await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
  } catch {
    /* orphaned object is a smaller problem than a failed request */
  }
}
