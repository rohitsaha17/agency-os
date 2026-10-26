/**
 * Shoots — the pure rules.
 *
 * A shoot is a named outing for a window of a day, with one or more people on
 * it. The web form speaks "HH:MM"; the store speaks minutes-from-midnight; the
 * grid speaks pixels. Everything that converts between those, or decides
 * whether a shoot is well formed, lives here as a pure function so it can be
 * tested without a browser or a database — the same discipline lib/availability
 * uses for dates, and for the same reason: times are the thing this feature
 * gets subtly wrong if the logic is scattered across components.
 *
 * Minutes, not timestamps: a shoot is "9:00–13:00 on the 4th" in the agency's
 * own wall clock. Storing an instant would drift across a UTC boundary and tell
 * someone a 9am shoot starts at 2:30pm. So the DAY is a day key (see
 * lib/availability dayKey) and the TIME is a plain minute count, 0..1439.
 */

export const MIN_TITLE = 2;
export const MAX_TITLE = 80;
export const MAX_LOCATION = 120;

/** A shoot is at least this long. Stops a 0-minute typo from a fat finger. */
export const MIN_SHOOT_MINUTES = 15;
/** The most participants one shoot can carry. A sanity cap, not a real limit. */
export const MAX_PARTICIPANTS = 50;

/** "09:30" → 570. Returns null for anything that is not a real time of day. */
export function parseTime(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 570 → "09:30". Clamps into the day so a stored out-of-range value still shows. */
export function formatTime(minute: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minute)));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "9:30 AM" — the human form, for labels and screen readers. */
export function formatTime12(minute: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minute)));
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return min === 0
    ? `${h12} ${ampm}`
    : `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** "9:30 AM – 1:00 PM" for a shoot's window. */
export function timeRangeLabel(startMinute: number, endMinute: number): string {
  return `${formatTime12(startMinute)} – ${formatTime12(endMinute)}`;
}

export type TimeCheck =
  | { ok: true; startMinute: number; endMinute: number }
  | { ok: false; error: string };

/**
 * Validate a from/to pair. Accepts either "HH:MM" strings (from the form) or
 * numbers (already minutes), so the same rule guards the API and the UI.
 */
export function validateTimes(from: unknown, to: unknown): TimeCheck {
  const start = typeof from === "number" ? from : parseTime(from);
  const end = typeof to === "number" ? to : parseTime(to);
  if (start === null) return { ok: false, error: "Pick a start time" };
  if (end === null) return { ok: false, error: "Pick an end time" };
  if (start < 0 || start > 1439 || end < 0 || end > 1439) {
    return { ok: false, error: "That time is not a real time of day" };
  }
  if (end <= start) return { ok: false, error: "The end time has to be after the start time" };
  if (end - start < MIN_SHOOT_MINUTES) {
    return { ok: false, error: `A shoot is at least ${MIN_SHOOT_MINUTES} minutes` };
  }
  return { ok: true, startMinute: start, endMinute: end };
}

export type TitleCheck = { ok: true; title: string } | { ok: false; error: string };

export function validateTitle(raw: unknown): TitleCheck {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (title.length < MIN_TITLE) {
    return { ok: false, error: "Give the shoot a name so the team knows what it is" };
  }
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep the name under ${MAX_TITLE} characters` };
  return { ok: true, title };
}

/** Optional location, trimmed and length-checked. Empty becomes null. */
export function cleanLocation(raw: unknown): string | null {
  const loc = typeof raw === "string" ? raw.trim() : "";
  if (!loc) return null;
  return loc.slice(0, MAX_LOCATION);
}

/** Do two minute-windows on the same day overlap? Touching edges don't count. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/* ------------------------------------------------------------------ *
 * The grid.
 *
 * The week view draws each shoot as a block positioned by its time. These keep
 * the day-column track and the components agreeing on where a given minute sits.
 * ------------------------------------------------------------------ */

/** Default visible band of the day, in hours. Widened to fit any early/late
 *  shoot actually in view — see visibleHourRange. */
export const DEFAULT_DAY_START_HOUR = 7;
export const DEFAULT_DAY_END_HOUR = 21; // exclusive-ish; the 21:00 line is drawn

/**
 * The hour band the grid should render, given the shoots on screen. Starts from
 * the default band and stretches to include the earliest start and latest end,
 * so a 6am call time or an 11pm wrap is never clipped. Always whole hours.
 */
export function visibleHourRange(
  shoots: { startMinute: number; endMinute: number }[],
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_DAY_START_HOUR;
  let endHour = DEFAULT_DAY_END_HOUR;
  for (const s of shoots) {
    startHour = Math.min(startHour, Math.floor(s.startMinute / 60));
    endHour = Math.max(endHour, Math.ceil(s.endMinute / 60));
  }
  // Keep it sane even if a stored value is wild.
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

/** A block's top offset and height as PERCENTAGES of the visible band, so the
 *  grid can be any pixel height and the maths stays in one place. */
export function blockGeometry(
  startMinute: number,
  endMinute: number,
  startHour: number,
  endHour: number,
): { topPct: number; heightPct: number } {
  const bandStart = startHour * 60;
  const bandMinutes = Math.max(1, (endHour - startHour) * 60);
  const top = ((startMinute - bandStart) / bandMinutes) * 100;
  const height = ((endMinute - startMinute) / bandMinutes) * 100;
  return {
    topPct: Math.max(0, Math.min(100, top)),
    heightPct: Math.max(0, Math.min(100 - Math.max(0, top), height)),
  };
}

/** Initials for an avatar chip: "Harsh Mehta" → "HM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
