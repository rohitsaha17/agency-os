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
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

/**
 * QA-005: a non-guessable object key. The old format was
 * `uploads/<millisecond-timestamp>_<original-filename>`, which is a small,
 * enumerable search space — so a public bucket's objects were guessable-adjacent.
 * A random UUID prefix removes that; the sanitized original name is kept only as
 * a readable suffix (the real display name lives on the DB row). Existing files
 * keep their stored keys — this only shapes NEW uploads.
 */
export function storageKey(originalName: string): string {
  const safe = (originalName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `uploads/${randomUUID()}_${safe}`;
}

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
  /** Key we can delete by later, and the ONLY handle the download route uses. */
  key: string;
  /**
   * A non-public reference for the DB `url` column. QA-005: this is deliberately
   * NOT the Supabase public object URL any more — nothing in the app fetches it
   * (every render/download goes through the authenticated /api/files/[id]/
   * download route via fileHref), so persisting a public URL only leaked a
   * guessable path. It is the app-relative key path, which is truthy (the UI
   * uses it only as a "has a file" flag) but resolves to nothing public.
   */
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
      + `Check that the "${BUCKET}" bucket exists in Supabase Storage.`,
    );
  }

  // QA-005: do NOT hand back the public object URL. The bytes are served only
  // through the authenticated, org-scoped download route (getFile reads via the
  // service credential, so a PRIVATE bucket works unchanged). We store the
  // app-relative key path — truthy for the UI's "has a file" checks, but not a
  // public, guessable link.
  return { key, url: `/${key}` };
}

/**
 * Read one stored object's bytes, for the authenticated download route.
 *
 * Goes through the service credential (or local disk), NOT the public URL, so
 * the app can serve files whether the bucket is public or private — the auth
 * and org checks happen in the route before we ever get here. Returns null when
 * the object is missing, so the route can answer 404 rather than 500.
 */
export async function getFile(
  key: string,
): Promise<{ body: Buffer; contentType: string | null } | null> {
  const cfg = remoteConfig();

  if (!cfg) {
    try {
      const body = await readFile(path.join(process.cwd(), "public", key));
      return { body, contentType: null };
    } catch {
      return null;
    }
  }

  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${key}`, {
    headers: { Authorization: `Bearer ${cfg.key}` },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { body: buf, contentType: res.headers.get("content-type") };
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
