/**
 * Accept a URL the way people actually type one.
 *
 * `<input type="url">` refuses anything without a scheme, so "www.smokzy.in"
 * — which is how nearly everyone writes a website — is rejected by the browser
 * with "Please enter a URL" and the form won't submit. The person is left
 * staring at a valid address being called invalid, with no hint that the fix
 * is to type eight more characters.
 *
 * So the inputs are plain text, and the value is normalised on the way out.
 */

/** Add https:// when a scheme is missing. Leaves blanks and mailto:/tel: alone. */
export function normalizeUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  // Already carries a scheme (http, https, mailto, tel, ftp, …).
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  // Protocol-relative, e.g. //example.com
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://${raw}`;
}

/**
 * Is this plausibly a web address? Deliberately permissive — this decides
 * whether to show a hint, never whether to block a save. A person who types
 * something odd knows more about their own link than a regex does.
 */
export function looksLikeUrl(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return true; // empty is not "wrong", just empty
  try {
    const u = new URL(normalizeUrl(raw));
    return !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}
