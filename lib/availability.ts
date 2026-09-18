/**
 * Who can be given work on a given day.
 *
 * Shoot crew are often freelancers. They are booked by other people, they take
 * leave without telling us, and they cannot do three shoots in a day however
 * the calendar looks. Before this, an SMM planning a month had no way to know
 * any of that until the photographer said so — usually after the date was
 * already promised to a client.
 *
 * Two separate ideas live here and they must not be conflated:
 *
 *   Unavailable — a hard block. The person has said they cannot work that
 *                 day. Assignment is refused.
 *   Load        — how much is already on them that day. Not a block; a
 *                 number the SMM weighs. Two shoots may be fine, four is not,
 *                 and only a person can judge which.
 *
 * The rules are pure functions so the date handling can be tested directly.
 * Dates are the thing this feature gets wrong if anyone is careless: a block
 * on the 4th must mean the 4th in the agency's calendar, not a timestamp that
 * drifts across midnight depending on where the server runs.
 */

export const MIN_REASON = 3;
export const MAX_REASON = 200;

export type UnavailabilityKind = "SHOOT" | "LEAVE" | "SICK" | "OTHER_CLIENT" | "OTHER";

export const KIND_LABEL: Record<UnavailabilityKind, string> = {
  SHOOT: "On a shoot",
  LEAVE: "On leave",
  SICK: "Unwell",
  OTHER_CLIENT: "Booked elsewhere",
  OTHER: "Unavailable",
};

/**
 * The canonical key for a calendar day: midnight UTC on that date.
 *
 * Every date in this feature goes through here before it is stored or
 * compared. Storing a local-time instant would mean a day blocked at 9am IST
 * and a day blocked at 9pm IST land on different rows for the same date, and
 * the unique constraint would not catch it.
 */
export function dayKey(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  // "2026-09-04" and "2026-09-04T18:30:00Z" both mean the 4th here.
  const [y, m, d] = input.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** "2026-09-04" — the form used in URLs and as a map key. */
export function dayString(input: string | Date): string {
  return dayKey(input).toISOString().slice(0, 10);
}

/**
 * Every day from `from` to `to` inclusive.
 *
 * The API takes a range because "I'm away the 4th to the 10th" is one thought,
 * and stores a row per day because that is what makes the check on every
 * assignment a lookup rather than an overlap query.
 */
export function expandRange(from: string | Date, to: string | Date, maxDays = 90): Date[] {
  const start = dayKey(from);
  const end = dayKey(to);
  if (end < start) return [];
  const out: Date[] = [];
  for (let d = new Date(start); d <= end && out.length < maxDays; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; error: string };

export function validateReason(raw: unknown): ReasonCheck {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < MIN_REASON) {
    return { ok: false, error: "Say briefly why — the person planning your work needs something to go on" };
  }
  if (reason.length > MAX_REASON) {
    return { ok: false, error: `Keep it under ${MAX_REASON} characters` };
  }
  return { ok: true, reason };
}

export interface BlockLike {
  userId: string;
  date: Date | string;
  kind?: UnavailabilityKind | string;
  reason?: string;
  user?: { id: string; name: string } | null;
}

/**
 * Which of `userIds` are blocked on `date`.
 *
 * Returns the blocks themselves, not booleans: the caller needs to say WHO
 * and WHY, and an error that just says "unavailable" sends the SMM hunting.
 */
export function blockedOn(
  blocks: BlockLike[],
  userIds: string[],
  date: string | Date,
): BlockLike[] {
  const key = dayString(date);
  const wanted = new Set(userIds);
  return blocks.filter((b) => wanted.has(b.userId) && dayString(b.date) === key);
}

/** The sentence shown when an assignment is refused. */
export function blockedMessage(blocks: BlockLike[], date: string | Date): string {
  const when = dayKey(date).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  const who = blocks
    .map((b) => {
      const name = b.user?.name ?? "They";
      const why = b.reason ? ` (${b.reason})` : "";
      return `${name}${why}`;
    })
    .join(", ");
  return blocks.length === 1
    ? `${who} is unavailable on ${when}. Pick another day or another person.`
    : `${who} are unavailable on ${when}. Pick another day or other people.`;
}

/**
 * How loaded somebody is on a day, as a word.
 *
 * Deliberately not a hard cap. How many shoots is too many depends on the
 * shoots, and a system that refused a third one would be wrong often enough
 * to be worked around. This is a signal for the person deciding.
 */
export type LoadLevel = "free" | "light" | "busy" | "heavy";

export function loadLevel(count: number): LoadLevel {
  if (count <= 0) return "free";
  if (count === 1) return "light";
  if (count === 2) return "busy";
  return "heavy";
}

export const LOAD_LABEL: Record<LoadLevel, string> = {
  free: "Free",
  light: "1 booked",
  busy: "2 booked",
  heavy: "Heavily booked",
};

/* ------------------------------------------------------------------ *
 * The planner's view of a day.
 *
 * Everything below turns the two facts we store — is there a block, and how
 * much work is due — into the one thing a grid cell has to say. It is pure so
 * the rules can be checked without a browser, and so the grid, the day list
 * and the mobile view cannot drift apart by each deciding for themselves what
 * "busy" means.
 *
 * The distinction the UI must never lose: AVAILABILITY is a hard fact the
 * person asserted, LOAD is a number the planner weighs. A cell that renders
 * "2 jobs" the same way it renders "On leave" has thrown away the difference
 * that makes this feature worth having.
 * ------------------------------------------------------------------ */

/** Short enough for a grid cell. KIND_LABEL is the sentence form. */
export const KIND_SHORT: Record<UnavailabilityKind, string> = {
  SHOOT: "On shoot",
  LEAVE: "Leave",
  SICK: "Sick",
  OTHER_CLIENT: "Other client",
  OTHER: "Unavailable",
};

export interface CellBlock {
  kind: UnavailabilityKind;
  reason: string;
  /** Came from an approved leave request, so it is not the person's to clear. */
  leave: boolean;
}

export interface DayCell {
  /** null when this viewer may not see workload — not the same as zero. */
  load: number | null;
  block: CellBlock | null;
}

/** The three words the summary strip counts in. */
export type DayStatus = "available" | "busy" | "away";

export function dayStatus(cell: DayCell): DayStatus {
  if (cell.block) return "away";
  // Unknown load is not evidence of being busy. Someone who cannot see
  // workload should be told "available", not guessed at.
  if (cell.load !== null && cell.load >= 2) return "busy";
  return "available";
}

/**
 * What the cell reads.
 *
 * Two lines, always, so the column has one rhythm: what they are (a status),
 * then the detail under it. Never colour alone — every state is legible in
 * greyscale, which is also how it reads to somebody colour-blind.
 */
export function cellLabel(cell: DayCell): { head: string; sub: string } {
  if (cell.block) {
    return { head: KIND_SHORT[cell.block.kind] ?? "Unavailable", sub: cell.block.reason };
  }
  if (cell.load === null) return { head: "Available", sub: "" };
  if (cell.load === 0) return { head: "Available", sub: "0 jobs" };
  if (cell.load === 1) return { head: "Available", sub: "1 job" };
  if (cell.load === 2) return { head: "2 jobs", sub: "Busy" };
  return { head: "Heavily booked", sub: `${cell.load} jobs` };
}

/** Spoken to a screen reader, and used as the cell's title. */
export function cellDescription(name: string, dateLabel: string, cell: DayCell): string {
  const { head, sub } = cellLabel(cell);
  const why = cell.block
    ? `${cell.block.leave ? "approved leave" : head.toLowerCase()} — ${cell.block.reason}`
    : sub || head.toLowerCase();
  return `${name}, ${dateLabel}: ${cell.block ? "unavailable" : "available"}, ${why}`;
}

/** Key into the load map the overview endpoint returns. */
export function loadKey(userId: string, date: string | Date): string {
  return `${userId}|${dayString(date)}`;
}
