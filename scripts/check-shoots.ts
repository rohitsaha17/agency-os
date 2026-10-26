/**
 * Shoots — the rules that are easy to break and silent when broken.
 *
 *   npx tsx scripts/check-shoots.ts
 *
 * Two kinds of guard here:
 *   1. The pure time/geometry maths (lib/shoots). A shoot stored as minutes and
 *      drawn as a block is exactly the sort of thing an off-by-one in the
 *      conversion ruins without any type error.
 *   2. That EVERY task-creation door runs assertNotOnShoot. The whole feature is
 *      worthless if one door still lets you assign work to someone on a shoot —
 *      which is precisely the bug class QA-017 fixed for the availability guard.
 */
import { readFileSync } from "fs";
import {
  parseTime, formatTime, formatTime12, timeRangeLabel, validateTimes, validateTitle,
  cleanLocation, overlaps, visibleHourRange, blockGeometry, initials,
  DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR, MIN_SHOOT_MINUTES,
} from "../lib/shoots";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      ${detail}`}`);
};

console.log("— time parsing/formatting round-trips —");
check("parseTime 09:30 → 570", parseTime("09:30") === 570);
check("parseTime 00:00 → 0", parseTime("00:00") === 0);
check("parseTime 23:59 → 1439", parseTime("23:59") === 1439);
check("parseTime rejects 24:00", parseTime("24:00") === null);
check("parseTime rejects 09:60", parseTime("09:60") === null);
check("parseTime rejects rubbish", parseTime("nope") === null && parseTime(570 as unknown) === null);
check("formatTime 570 → 09:30", formatTime(570) === "09:30");
check("formatTime clamps out-of-range high", formatTime(99999) === "23:59");
check("formatTime clamps out-of-range low", formatTime(-5) === "00:00");
check("formatTime12 noon", formatTime12(12 * 60) === "12 PM");
check("formatTime12 midnight", formatTime12(0) === "12 AM");
check("formatTime12 09:30", formatTime12(570) === "9:30 AM");
check("timeRangeLabel", timeRangeLabel(540, 780) === "9 AM – 1 PM");

console.log("\n— validateTimes —");
check("good range ok", validateTimes("09:00", "13:00").ok);
check("end before start rejected", !validateTimes("13:00", "09:00").ok);
check("equal rejected", !validateTimes("09:00", "09:00").ok);
check("too short rejected", !validateTimes("09:00", "09:05").ok);
check(`min length is ${MIN_SHOOT_MINUTES}`, validateTimes("09:00", `09:${MIN_SHOOT_MINUTES}`).ok);
check("accepts numbers too", validateTimes(540, 600).ok);
check("bad start rejected", !validateTimes("nope", "13:00").ok);

console.log("\n— validateTitle / cleanLocation —");
check("empty title rejected", !validateTitle("  ").ok);
check("one char rejected", !validateTitle("a").ok);
check("normal title ok + trimmed", (() => { const r = validateTitle("  Nykaa shoot "); return r.ok && r.title === "Nykaa shoot"; })());
check("overlong title rejected", !validateTitle("x".repeat(200)).ok);
check("empty location → null", cleanLocation("   ") === null);
check("location trimmed", cleanLocation("  Studio 4 ") === "Studio 4");

console.log("\n— overlaps —");
check("overlapping windows", overlaps(540, 660, 600, 720));
check("touching edges don't overlap", !overlaps(540, 600, 600, 660));
check("disjoint don't overlap", !overlaps(540, 600, 700, 800));

console.log("\n— grid geometry —");
check("default band", (() => { const r = visibleHourRange([]); return r.startHour === DEFAULT_DAY_START_HOUR && r.endHour === DEFAULT_DAY_END_HOUR; })());
check("band stretches to an early call", visibleHourRange([{ startMinute: 5 * 60, endMinute: 6 * 60 }]).startHour === 5);
check("band stretches to a late wrap", visibleHourRange([{ startMinute: 20 * 60, endMinute: 23 * 60 + 30 }]).endHour === 24);
check("a mid-band shoot sits below the top", (() => {
  const g = blockGeometry(9 * 60, 10 * 60, 7, 21); return g.topPct > 0 && g.heightPct > 0;
})());
check("a shoot never spills past the band", (() => {
  const g = blockGeometry(20 * 60, 23 * 60, 7, 21); return g.topPct + g.heightPct <= 100.0001;
})());

console.log("\n— initials —");
check("two words", initials("Harsh Mehta") === "HM");
check("one word", initials("Harsh") === "HA");
check("blank", initials("   ") === "?");

/* ---------------------------------------------------------------- *
 * The important one: every task-creation door enforces the shoot block.
 * ---------------------------------------------------------------- */
console.log("\n— every task door runs assertNotOnShoot —");
const DOORS = [
  "app/api/tasks/route.ts",
  "app/api/tasks/[id]/route.ts",
  "app/api/projects/[id]/tasks/route.ts",
  "app/api/content-items/route.ts",
  "app/api/content-items/[id]/route.ts",
];
for (const door of DOORS) {
  let src = "";
  try { src = readFileSync(door, "utf8"); } catch { /* reported below */ }
  const callsAssignable = src.includes("assertAssignable(");
  const callsShoot = src.includes("assertNotOnShoot(");
  check(
    `${door} calls assertNotOnShoot`,
    callsShoot,
    callsAssignable
      ? "this door guards availability but NOT shoots — add assertNotOnShoot beside assertAssignable."
      : "could not read the door, or it no longer guards assignment at all.",
  );
}

console.log(fails === 0 ? "\nAll shoot checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
