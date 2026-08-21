/**
 * A calendar day as YYYY-MM-DD, in the viewer's own timezone.
 *
 * `new Date().toISOString().slice(0, 10)` converts to UTC first. Anywhere east
 * of Greenwich that means the small hours belong to the previous day: a task
 * added at 1am in Kolkata (19:30 UTC yesterday) was stamped with yesterday's
 * date and immediately rendered as "Yesterday". West of Greenwich the same bug
 * runs the other way, filing late-evening entries under tomorrow.
 *
 * Date inputs and day comparisons are all local, so the key has to be too.
 */
export function todayKey(): string {
  return dateKey(new Date());
}

export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
