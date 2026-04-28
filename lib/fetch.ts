/**
 * Small fetch wrapper with typed errors and JSON defaults.
 *
 * Usage:
 *   const data = await apiFetch<{ ok: boolean }>("/api/foo", { method: "POST", body: { x: 1 } });
 *   // Pass signal for cancellation:
 *   const ctrl = new AbortController();
 *   apiFetch("/api/foo", { signal: ctrl.signal });
 */

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Body will be JSON-stringified if it is not a string / FormData / Blob / URLSearchParams. */
  body?: unknown;
}

function isRawBody(v: unknown): v is BodyInit {
  if (typeof v === "string") return true;
  if (typeof FormData !== "undefined" && v instanceof FormData) return true;
  if (typeof Blob !== "undefined" && v instanceof Blob) return true;
  if (typeof URLSearchParams !== "undefined" && v instanceof URLSearchParams) return true;
  if (typeof ArrayBuffer !== "undefined" && v instanceof ArrayBuffer) return true;
  return false;
}

export async function apiFetch<T = unknown>(
  url: string,
  opts: ApiFetchOptions = {}
): Promise<T> {
  const { body, headers, ...rest } = opts;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (isRawBody(body)) {
      finalBody = body;
    } else {
      finalBody = JSON.stringify(body);
      if (!finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
        finalHeaders["Content-Type"] = "application/json";
      }
    }
  }

  const res = await fetch(url, { ...rest, headers: finalHeaders, body: finalBody });

  const ct = res.headers.get("content-type") ?? "";
  const parseBody = async (): Promise<unknown> => {
    if (ct.includes("application/json")) {
      try { return await res.json(); } catch { return null; }
    }
    try { return await res.text(); } catch { return null; }
  };

  if (!res.ok) {
    const parsed = await parseBody();
    let msg = `Request failed with status ${res.status}`;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      const err = p.error;
      if (typeof err === "string") msg = err;
      else if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
        msg = (err as Record<string, string>).message;
      } else if (typeof p.message === "string") msg = p.message;
    } else if (typeof parsed === "string" && parsed) {
      msg = parsed;
    }
    throw new ApiError(msg, res.status, parsed);
  }

  const parsed = await parseBody();
  return parsed as T;
}
