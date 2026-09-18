/**
 * Date handling and the blocking rules for unavailability.
 *
 * Run after touching lib/availability.ts:
 *   npx tsx scripts/check-availability.ts
 * Exits non-zero on any regression.
 */
import {
  dayKey, dayString, expandRange, validateReason, blockedOn, blockedMessage,
  loadLevel, MAX_REASON, dayStatus, cellLabel, cellDescription, loadKey,
  KIND_SHORT, type DayCell,
} from "../lib/availability";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("— a day is a day, whatever time it arrives as —");
check("plain date", dayString("2026-09-04"), "2026-09-04");
check("morning IST (18:30Z the day before is still the 4th to us)",
  dayString("2026-09-04T03:00:00Z"), "2026-09-04");
check("late evening UTC same day", dayString("2026-09-04T23:59:00Z"), "2026-09-04");
check("a Date object", dayString(new Date("2026-09-04T12:00:00Z")), "2026-09-04");
check("midnight UTC is the stored key", dayKey("2026-09-04").toISOString(), "2026-09-04T00:00:00.000Z");
check("two spellings of the same day collide (so the unique index bites)",
  dayKey("2026-09-04").getTime() === dayKey("2026-09-04T22:00:00Z").getTime(), true);

console.log("\n— ranges —");
check("a week is seven days", expandRange("2026-09-04", "2026-09-10").length, 7);
check("one day is one row", expandRange("2026-09-04", "2026-09-04").length, 1);
check("backwards range yields nothing rather than looping forever",
  expandRange("2026-09-10", "2026-09-04"), []);
check("crosses a month boundary",
  expandRange("2026-09-29", "2026-10-02").map(dayString),
  ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
check("crosses a year boundary",
  expandRange("2026-12-31", "2027-01-01").map(dayString), ["2026-12-31", "2027-01-01"]);
check("a leap day is a real day",
  expandRange("2028-02-28", "2028-03-01").map(dayString),
  ["2028-02-28", "2028-02-29", "2028-03-01"]);
check("an absurd range is capped, not fatal", expandRange("2026-01-01", "2030-01-01").length, 90);

console.log("\n— the reason —");
check("empty refused", validateReason("").ok, false);
check("whitespace refused", validateReason("   ").ok, false);
check("real reason accepted", validateReason("Shooting for Nova all day").ok, true);
check("trimmed", (validateReason("  On leave  ") as { reason: string }).reason, "On leave");
check("over the limit refused", validateReason("x".repeat(MAX_REASON + 1)).ok, false);
check("non-string refused", validateReason(99).ok, false);

console.log("\n— who is blocked —");
const blocks = [
  { userId: "vik", date: "2026-09-04T00:00:00Z", reason: "Nova shoot", user: { id: "vik", name: "Vikram" } },
  { userId: "ana", date: "2026-09-05T00:00:00Z", reason: "Leave", user: { id: "ana", name: "Ananya" } },
];
check("blocked on the day", blockedOn(blocks, ["vik"], "2026-09-04").length, 1);
check("free the next day", blockedOn(blocks, ["vik"], "2026-09-05").length, 0);
check("someone else's block does not block you", blockedOn(blocks, ["vik"], "2026-09-05").length, 0);
check("checking several people at once", blockedOn(blocks, ["vik", "ana"], "2026-09-05").length, 1);
check("nobody asked for, nobody blocked", blockedOn(blocks, [], "2026-09-04").length, 0);
check("a timestamp on the blocked day still matches",
  blockedOn(blocks, ["vik"], "2026-09-04T19:30:00Z").length, 1);

console.log("\n— the refusal message names who and why —");
const msg = blockedMessage(blockedOn(blocks, ["vik"], "2026-09-04"), "2026-09-04");
check("names the person", msg.includes("Vikram"), true);
check("gives the reason", msg.includes("Nova shoot"), true);
check("gives the date", msg.includes("Sep 4, 2026"), true);

console.log("\n— load is a signal, not a limit —");
check("nothing on", loadLevel(0), "free");
check("one", loadLevel(1), "light");
check("two", loadLevel(2), "busy");
check("three is heavy but still allowed", loadLevel(3), "heavy");

console.log("\n— the grid cell: what a planner is told —");
const cell = (load: number | null, block: DayCell["block"] = null): DayCell => ({ load, block });
const away = (kind: keyof typeof KIND_SHORT, leave = false): DayCell =>
  cell(0, { kind, reason: "Nova shoot", leave });

check("nothing on is available", dayStatus(cell(0)), "available");
check("one job is still available", dayStatus(cell(1)), "available");
check("two is busy", dayStatus(cell(2)), "busy");
check("five is busy, not refused", dayStatus(cell(5)), "busy");
check("a block beats any workload", dayStatus(away("SICK")), "away");
check("a block beats a full diary too",
  dayStatus({ load: 9, block: { kind: "LEAVE", reason: "x", leave: true } }), "away");

console.log("\n— not knowing the workload is not the same as an empty one —");
check("hidden load reads available", dayStatus(cell(null)), "available");
check("hidden load says nothing about jobs", cellLabel(cell(null)), { head: "Available", sub: "" });
check("zero load says so out loud", cellLabel(cell(0)), { head: "Available", sub: "0 jobs" });
check("one job is singular", cellLabel(cell(1)).sub, "1 job");
check("two jobs leads with the number", cellLabel(cell(2)).head, "2 jobs");
check("heavy names itself", cellLabel(cell(4)), { head: "Heavily booked", sub: "4 jobs" });
check("a block shows its kind, not its load", cellLabel(away("OTHER_CLIENT")).head, "Other client");
check("a block shows its reason", cellLabel(away("OTHER_CLIENT")).sub, "Nova shoot");

console.log("\n— every state is legible without colour —");
for (const k of Object.keys(KIND_SHORT) as (keyof typeof KIND_SHORT)[]) {
  check(k + " has a word", KIND_SHORT[k].length > 0, true);
}
check("the label never comes back blank", cellLabel(cell(0)).head.length > 0, true);

console.log("\n— what a screen reader hears —");
const spoken = cellDescription("Vikram", "Thu 4", away("LEAVE", true));
check("names the person", spoken.includes("Vikram"), true);
check("says unavailable in words", spoken.includes("unavailable"), true);
check("calls approved leave what it is", spoken.includes("approved leave"), true);
check("an open day says available", cellDescription("Ana", "Fri 5", cell(1)).includes("available"), true);

console.log("\n— the load map key —");
check("keyed by person and day", loadKey("vik", "2026-09-04"), "vik|2026-09-04");
check("a timestamp lands on the same key", loadKey("vik", "2026-09-04T19:30:00Z"), "vik|2026-09-04");


console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
