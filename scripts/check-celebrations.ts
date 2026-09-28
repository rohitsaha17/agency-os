/**
 * Birthdays and anniversaries.
 *
 *   npx tsx scripts/check-celebrations.ts
 *
 * Dates are where this kind of feature quietly fails, and the failures look
 * plausible: a greeting a day early for half of every day, a leap-day
 * birthday landing on somebody else's 1 March, "0 years" on a new joiner's
 * first week, the same notification sent five times because five people
 * opened their dashboard. Each of those is a case below.
 */
import {
  localDay, dayToISO, daysBetween, nextOccurrenceOn, monthDayOf,
  celebrationsWithin, countdown, noticeForOthers, noticeForSelf,
  celebrationDedupeKey, type CelebrationPerson,
} from "../lib/celebrations";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("— the day is the ORGANIZATION's, not the server's —");
// 27 Sep 2026, 19:00 UTC. In Kolkata (+5:30) it is already the 28th.
const evening = new Date("2026-09-27T19:00:00Z");
check("UTC still calls it the 27th", dayToISO(localDay(evening, "UTC")), "2026-09-27");
check("Kolkata is already on the 28th", dayToISO(localDay(evening, "Asia/Kolkata")), "2026-09-28");
check("New York is still on the 27th", dayToISO(localDay(evening, "America/New_York")), "2026-09-27");

console.log("");
console.log("— 29 February —");
check("a leap year keeps the 29th",
  nextOccurrenceOn("02-29", { y: 2028, m: 1, d: 1 }), { y: 2028, m: 2, d: 29 });
check("a common year moves it to the 28th, not to 1 March",
  nextOccurrenceOn("02-29", { y: 2027, m: 1, d: 1 }), { y: 2027, m: 2, d: 28 });

console.log("");
console.log("— the turn of the year —");
check("31 Dec today is today",
  daysBetween({ y: 2026, m: 12, d: 31 }, nextOccurrenceOn("12-31", { y: 2026, m: 12, d: 31 })!), 0);
check("1 Jan from 31 Dec is tomorrow, in the next year",
  nextOccurrenceOn("01-01", { y: 2026, m: 12, d: 31 }), { y: 2027, m: 1, d: 1 });
check("...and that is one day away, not minus three hundred and sixty four",
  daysBetween({ y: 2026, m: 12, d: 31 }, { y: 2027, m: 1, d: 1 }), 1);

console.log("");
console.log("— who is in the week —");
const TODAY = { y: 2026, m: 9, d: 28 };
const PEOPLE: CelebrationPerson[] = [
  { id: "a", name: "Aditi Rao",   birthday: "09-28" },                       // today
  { id: "b", name: "Rana Sen",    birthday: "09-30" },                       // in 2
  { id: "c", name: "Kunj Shah",   birthday: "10-20" },                       // far off
  { id: "d", name: "Twinkle S",   joined: "2023-09-28T00:00:00.000Z" },      // 3 years today
  { id: "e", name: "New Starter", joined: "2026-09-29T00:00:00.000Z" },      // joined this year
  { id: "f", name: "No Dates",    birthday: null, joined: null },
];
const week = celebrationsWithin(PEOPLE, TODAY, 7);
check("only people inside the window",
  week.map((c) => `${c.name}:${c.daysAway}`),
  ["Aditi Rao:0", "Twinkle S:0", "Rana Sen:2"]);
check("an anniversary carries its years", week.find((c) => c.personId === "d")?.years, 3);
check("a birthday carries none", week.find((c) => c.personId === "a")?.years, null);
check("somebody's joining year is not an anniversary",
  week.some((c) => c.personId === "e"), false);
check("nobody with no dates recorded appears",
  week.some((c) => c.personId === "f"), false);
check("it lands on the right date", week[0].on, "2026-09-28");

console.log("");
console.log("— what people are told —");
const bday = week.find((c) => c.personId === "a")!;
const anniv = week.find((c) => c.personId === "d")!;
check("the team hears about them", noticeForOthers(bday), "It's Aditi Rao's birthday today");
check("they hear a greeting, by first name", noticeForSelf(bday), "Happy birthday, Aditi!");
check("an anniversary counts the years", noticeForOthers(anniv), "Twinkle S completes 3 years today");
check("one year is singular",
  noticeForOthers({ ...anniv, years: 1 }), "Twinkle S completes 1 year today");
check("today reads as Today", countdown(0), "Today");
check("tomorrow reads as Tomorrow", countdown(1), "Tomorrow");
check("beyond that it counts", countdown(5), "In 5 days");

console.log("");
console.log("— the same greeting is never sent twice —");
const k = (recipient: string) => celebrationDedupeKey("org1", "2026-09-28", "BIRTHDAY", "a", recipient);
check("stable for the same occasion and recipient", k("u1"), k("u1"));
check("different per recipient", k("u1") === k("u2"), false);
check("different per day",
  celebrationDedupeKey("org1", "2026-09-28", "BIRTHDAY", "a", "u1")
    === celebrationDedupeKey("org1", "2027-09-28", "BIRTHDAY", "a", "u1"), false);
check("different per occasion kind",
  celebrationDedupeKey("org1", "2026-09-28", "BIRTHDAY", "a", "u1")
    === celebrationDedupeKey("org1", "2026-09-28", "ANNIVERSARY", "a", "u1"), false);
check("and never crosses organizations",
  celebrationDedupeKey("org1", "2026-09-28", "BIRTHDAY", "a", "u1")
    === celebrationDedupeKey("org2", "2026-09-28", "BIRTHDAY", "a", "u1"), false);

console.log("");
console.log("— odds and ends —");
check("a stored date keeps its day", monthDayOf("1998-03-14T00:00:00.000Z"), "03-14");
check("nothing in, nothing out", monthDayOf(null), null);
check("rubbish in, nothing out", nextOccurrenceOn("13-40", TODAY), null);

console.log(fails === 0 ? "\nAll celebration checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
