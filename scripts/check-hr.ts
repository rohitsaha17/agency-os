/**
 * The HR rules, and who is allowed to see pay.
 *
 * Run after touching lib/hr.ts or the HR capabilities:
 *   npx tsx scripts/check-hr.ts
 * Exits non-zero on any regression.
 */
import {
  dayKey, dayString, leaveDays, expandRange, validateLeaveReason,
  validateLeaveRange, canSelfCheckIn, canDecide, canCancel,
  monthKey, isMonthKey, outstanding, payslip, leaveBlockRows, LEAVE_BLOCK_REASON,
  attendanceDay, DAY_STARTS_AT_HOUR,
} from "../lib/hr";
import { can } from "../lib/permissions";
import { maySetAvailability, mayReadAvailability, mayResetPassword } from "../lib/api-permissions";
import { generateTemporaryPassword, validatePassword, verifyPassword, hashPassword } from "../lib/password";
import {
  money, amount, longDate, shortDate, dateRange, monthName, shiftMonth,
  monthDays, attendanceState, leaveOn, attendanceRate, recoveryMonths,
  advanceState, matchesQuery, ATTENDANCE_LABEL,
} from "../lib/people";

let fails = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("— a day is a day, whatever time it arrives as —");
check("plain date", dayString("2026-09-16"), "2026-09-16");
check("morning IST is still the 16th", dayString("2026-09-16T03:00:00Z"), "2026-09-16");
check("late evening UTC, same day", dayString("2026-09-16T23:59:00Z"), "2026-09-16");
check("two spellings collide, so the unique index bites",
  dayKey("2026-09-16").getTime() === dayKey("2026-09-16T22:00:00Z").getTime(), true);

console.log("\n— leave ranges —");
check("one day is one day", leaveDays("2026-09-16", "2026-09-16"), 1);
check("inclusive of both ends", leaveDays("2026-09-16", "2026-09-18"), 3);
check("backwards is nothing", leaveDays("2026-09-18", "2026-09-16"), 0);
check("range expands inclusively", expandRange("2026-09-16", "2026-09-18").map((d) => dayString(d)),
  ["2026-09-16", "2026-09-17", "2026-09-18"]);
check("a typo spanning years is capped", expandRange("2026-01-01", "2030-01-01").length, 90);
check("end before start is refused", !!validateLeaveRange("2026-09-18", "2026-09-16"), true);
check("90 days is fine", validateLeaveRange("2026-01-01", "2026-03-31"), null);
check("91 days is not", !!validateLeaveRange("2026-01-01", "2026-04-30"), true);

console.log("\n— a reason somebody can act on —");
check("empty is refused", !!validateLeaveReason(""), true);
check("'ok' is refused", !!validateLeaveReason("ok"), true);
check("a real reason passes", validateLeaveReason("Sister's wedding in Jaipur"), null);
check("500 chars is fine", validateLeaveReason("x".repeat(500)), null);
check("501 is not", !!validateLeaveReason("x".repeat(501)), true);

console.log("");
console.log("— the working day runs 6am to 6am, in the ORG's timezone —");
const IST = "Asia/Kolkata";
// The instants below are UTC; IST is UTC+5:30.
check("mid-morning IST is that day",        attendanceDay(new Date("2026-09-18T05:00:00Z"), IST), "2026-09-18");
check("late evening IST is still that day", attendanceDay(new Date("2026-09-18T17:00:00Z"), IST), "2026-09-18");
check("after midnight is STILL the day before — one shift, one row",
  attendanceDay(new Date("2026-09-18T20:00:00Z"), IST), "2026-09-18");
check("05:59 IST still belongs to yesterday",
  attendanceDay(new Date("2026-09-19T00:29:00Z"), IST), "2026-09-18");
check("06:00 IST starts the new day",
  attendanceDay(new Date("2026-09-19T00:30:00Z"), IST), "2026-09-19");
check("the boundary is 6, not midnight", DAY_STARTS_AT_HOUR, 6);
// Vercel runs UTC. Reading the server's own date would be wrong for an
// Indian team every evening after half past five.
check("18:30 IST is already tomorrow in UTC, but today for the team",
  attendanceDay(new Date("2026-09-18T13:30:00Z"), IST), "2026-09-18");
check("a UTC org at 3am is still on the previous day",
  attendanceDay(new Date("2026-09-18T03:00:00Z"), "UTC"), "2026-09-17");
check("a UTC org at 7am has rolled over",
  attendanceDay(new Date("2026-09-18T07:00:00Z"), "UTC"), "2026-09-18");

console.log("\n— check-in is for today, once —");
const NOW = new Date("2026-09-16T09:30:00Z"); // 15:00 IST
check("today is allowed", canSelfCheckIn("2026-09-16", NOW, IST), null);
check("tomorrow is refused", !!canSelfCheckIn("2026-09-17", NOW, IST), true);
check("yesterday is refused — an admin adds it instead", !!canSelfCheckIn("2026-09-15", NOW, IST), true);
// 01:30 IST on the 17th: the 16th is still the open day, so checking in for
// the 16th is allowed and the 17th is not yet a thing.
const AFTER_MIDNIGHT = new Date("2026-09-16T20:00:00Z");
check("at 1:30am you may still check in for the day you're working",
  canSelfCheckIn("2026-09-16", AFTER_MIDNIGHT, IST), null);
check("at 1:30am the next date is not open yet",
  !!canSelfCheckIn("2026-09-17", AFTER_MIDNIGHT, IST), true);

console.log("\n— decisions —");
check("pending can be decided", canDecide("PENDING"), true);
check("approved cannot be decided again", canDecide("APPROVED"), false);
check("rejected cannot be decided again", canDecide("REJECTED"), false);
check("own pending request can be withdrawn", canCancel("PENDING", true), true);
check("somebody else's cannot", canCancel("PENDING", false), false);
check("an approver may withdraw somebody else's pending one", canCancel("PENDING", false, true), true);
check("the person who asked cannot un-approve their own", canCancel("APPROVED", true), false);
check("an approver CAN revoke an approved one — plans change", canCancel("APPROVED", false, true), true);
check("a rejected one stays rejected", canCancel("REJECTED", true, true), false);
check("a cancelled one is not re-cancellable", canCancel("CANCELLED", true, true), false);

console.log("");
console.log("— approved leave becomes days blocked on the diary —");
const blocks = leaveBlockRows({
  organizationId: "org1", userId: "u1", leaveRequestId: "lr1",
  start: "2026-09-20", end: "2026-09-22", createdById: "admin1",
});
check("one row per day, inclusive", blocks.length, 3);
check("the days are the range", blocks.map((b) => dayString(b.date)),
  ["2026-09-20", "2026-09-21", "2026-09-22"]);
check("every row is kind LEAVE", blocks.every((b) => b.kind === "LEAVE"), true);
check("every row points back at the request", blocks.every((b) => b.leaveRequestId === "lr1"), true);
check("the PRIVATE reason never reaches the block — it was for the approver",
  blocks.every((b) => b.reason === LEAVE_BLOCK_REASON), true);
check("a single day is a single block", leaveBlockRows({
  organizationId: "o", userId: "u", leaveRequestId: "l",
  start: "2026-09-20", end: "2026-09-20" }).length, 1);
check("a backwards range blocks nothing rather than throwing", leaveBlockRows({
  organizationId: "o", userId: "u", leaveRequestId: "l",
  start: "2026-09-22", end: "2026-09-20" }).length, 0);

console.log("\n— months —");
check("a month key passes through", monthKey("2026-09"), "2026-09");
check("a date becomes its month", monthKey(new Date("2026-09-16T00:00:00Z")), "2026-09");
check("single digits pad", monthKey(new Date("2026-01-05T00:00:00Z")), "2026-01");
check("'2026-9' is not a month key", isMonthKey("2026-9"), false);
check("'2026-13' is not a month", isMonthKey("2026-13"), false);
check("'2026-12' is", isMonthKey("2026-12"), true);

console.log("\n— advances —");
check("nothing repaid, all outstanding", outstanding(10000, 0), 10000);
check("part repaid", outstanding(10000, 2500), 7500);
check("overpaid never goes negative", outstanding(10000, 12000), 0);

console.log("\n— the payslip —");
check("no advance, net is gross", payslip(50000, 0, 0), { gross: 50000, deduction: 0, net: 50000 });
check("ordinary recovery", payslip(50000, 5000, 20000), { gross: 50000, deduction: 5000, net: 45000 });
check("cannot recover more than is owed",
  payslip(50000, 30000, 8000), { gross: 50000, deduction: 8000, net: 42000 });
check("cannot recover more than the month pays — no negative payslip",
  payslip(20000, 50000, 50000), { gross: 20000, deduction: 20000, net: 0 });
check("a negative deduction is not a bonus", payslip(50000, -5000, 10000), { gross: 50000, deduction: 0, net: 50000 });

console.log("\n— who sees pay —");
const U = (role: string) => ({ id: "u1", role });
for (const role of ["OWNER", "ADMIN"]) {
  check(`${role} runs payroll`, can(U(role), "payroll.manage"), true);
}
check("MANAGER approves leave", can(U("MANAGER"), "hr.manage"), true);
check("MANAGER does NOT see salary", can(U("MANAGER"), "payroll.manage"), false);
/*
  An SMM is senior about content and nothing else.

  hr.view is the whole People module — every colleague's attendance month and
  a staff directory holding phone numbers, dates of birth, addresses and next
  of kin. Delegating work to a junior does not require any of it, and these
  assertions exist so nobody quietly hands it back while tidying the matrix.
*/
check("SMM sees who is in today", can(U("SMM"), "hr.today"), true);
check("SMM cannot read the attendance history", can(U("SMM"), "hr.records"), false);
check("SMM cannot read staff records", can(U("SMM"), "hr.records"), false);
check("SMM does not manage staff records", can(U("SMM"), "hr.manage"), false);
check("SMM does not see salary", can(U("SMM"), "payroll.manage"), false);
check("SMM does not decide what is billable", can(U("SMM"), "billing.flag"), false);
check("…and is exactly TEAM on every management capability",
  (["users.manage", "settings.manage", "clients.manage", "projects.manage",
    "projects.pricing", "projects.assignSmm", "financials.view", "invoices.manage",
    "reports.all", "billing.flag", "hr.records", "hr.manage", "payroll.manage"] as const)
    .every((c) => can(U("SMM"), c) === can(U("TEAM"), c)), true);

console.log("");
console.log("— but still senior about content —");
check("SMM plans content", can(U("SMM"), "content.plan"), true);
check("SMM briefs juniors", can(U("SMM"), "tasks.assign"), true);
check("SMM reviews what comes back", can(U("SMM"), "tasks.review"), true);
check("SMM closes their own cycle", can(U("SMM"), "cycles.close"), true);
check("SMM sees delivery reporting", can(U("SMM"), "reports.delivery"), true);
check("a TEAM member does none of those",
  (["content.plan", "tasks.assign", "tasks.review", "cycles.close", "reports.delivery"] as const)
    .every((c) => can(U("TEAM"), c) === false), true);

console.log("");
console.log("— and scheduling still works without the HR record —");
check("SMM can still read the team's diary", mayReadAvailability(U("SMM"), "u2"), true);
check("a MANAGER keeps the whole People module",
  can(U("MANAGER"), "hr.today") && can(U("MANAGER"), "hr.records"), true);
check("an ADMIN keeps it",
  can(U("ADMIN"), "hr.today") && can(U("ADMIN"), "hr.records"), true);
// The split is only worth having if the two halves can actually differ.
check("hr.today and hr.records are genuinely separate for SMM",
  can(U("SMM"), "hr.today") !== can(U("SMM"), "hr.records"), true);
check("TEAM checks themselves in", can(U("TEAM"), "attendance.mark"), true);
check("TEAM does not see the team board", can(U("TEAM"), "hr.today"), false);
check("…nor the records behind it", can(U("TEAM"), "hr.records"), false);
check("TEAM does not see salary", can(U("TEAM"), "payroll.manage"), false);
check("everybody can check in", ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"].every((r) => can(U(r), "attendance.mark")), true);
check("OWNER is excused from checking in", can(U("OWNER"), "attendance.exempt"), true);
check("ADMIN is excused", can(U("ADMIN"), "attendance.exempt"), true);
check("MANAGER is staff and checks in", can(U("MANAGER"), "attendance.exempt"), false);
check("SMM checks in", can(U("SMM"), "attendance.exempt"), false);
check("TEAM checks in", can(U("TEAM"), "attendance.exempt"), false);
check("a half-loaded user gets nothing", can(null, "payroll.manage"), false);
check("an unknown role gets nothing", can({ id: "x", role: "INTERN" }, "payroll.manage"), false);

console.log("");
console.log("— only the shoot crew block their own days —");
const crew = (role: string) => ({ id: "u1", role, jobTitle: { blocksOwnDays: true } });
const desk = (role: string) => ({ id: "u1", role, jobTitle: { blocksOwnDays: false } });
const noTitle = (role: string) => ({ id: "u1", role, jobTitle: null });

check("a photographer blocks their own day", maySetAvailability(crew("TEAM"), "u1"), true);
check("an editor cannot", maySetAvailability(desk("TEAM"), "u1"), false);
check("somebody with no job title cannot", maySetAvailability(noTitle("SMM"), "u1"), false);
check("an SMM is not crew by virtue of being senior", maySetAvailability(desk("SMM"), "u1"), false);
check("a photographer still cannot block SOMEBODY ELSE", maySetAvailability(crew("TEAM"), "u2"), false);
// The branch that left an owner able to block everyone's diary but their own.
check("an ADMIN may block their own", maySetAvailability(noTitle("ADMIN"), "u1"), true);
check("an ADMIN may block somebody else's", maySetAvailability(noTitle("ADMIN"), "u2"), true);
check("an OWNER may block their own", maySetAvailability(noTitle("OWNER"), "u1"), true);
check("a MANAGER may not block somebody else's", maySetAvailability(desk("MANAGER"), "u2"), false);

console.log("");
console.log("— but everybody can SEE the diary —");
for (const role of ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"]) {
  check(`${role} sees somebody else's blocked days`,
    mayReadAvailability({ id: "u1", role }, "u2"), true);
}

console.log("");
console.log("— how the People module says money —");
check("Indian grouping, in lakhs", money(680000, "INR"), "₹6,80,000");
check("and again at a smaller figure", money(80000, "INR"), "₹80,000");
check("other currencies keep their own grouping", money(680000, "USD"), "$680,000");
check("nothing entered is a dash, never a zero", money(null), "—");
check("zero entered IS zero", money(0, "INR"), "₹0");
check("a bad number is a dash rather than NaN", money(Number.NaN), "—");
check("amounts without the symbol still group", amount(680000, "INR"), "6,80,000");

console.log("");
console.log("— dates read as people write them —");
check("long form", longDate("2026-09-18"), "18 Sep 2026");
check("short form drops the year", shortDate("2026-09-18"), "18 Sep");
check("a missing date is a dash", longDate(null), "—");
check("a day key is read as UTC, not local",
  longDate("2026-09-01T00:00:00Z"), "1 Sep 2026");
check("one day is not a range", dateRange("2026-09-20", "2026-09-20", new Date("2026-06-01")), "20 Sep");
check("a range in this year leaves the year out",
  dateRange("2026-09-20", "2026-09-22", new Date("2026-06-01")), "20 Sep → 22 Sep");
check("a range in another year keeps it",
  dateRange("2025-12-30", "2026-01-02", new Date("2026-06-01")), "30 Dec 2025 → 2 Jan 2026");
check("a month key becomes a month", monthName("2026-09"), "September 2026");
check("stepping back over a year boundary", shiftMonth("2026-01", -1), "2025-12");
check("stepping forward over one", shiftMonth("2026-12", 1), "2027-01");
check("September has thirty days", monthDays("2026-09").length, 30);
check("February 2028 has twenty-nine", monthDays("2028-02").length, 29);
check("a junk month yields nothing rather than throwing", monthDays("nope"), []);

console.log("");
console.log("— an attendance cell —");
const IN = { date: "2026-09-10", checkedInAt: "2026-09-10T03:30:00Z" };
const OFF = { start: "2026-09-12", end: "2026-09-14" };
check("checked in is present", attendanceState(IN, undefined, "2026-09-10", "2026-09-18"), "PRESENT");
check("approved leave is leave", attendanceState(undefined, OFF, "2026-09-13", "2026-09-18"), "LEAVE");
check("a past blank is no record", attendanceState(undefined, undefined, "2026-09-09", "2026-09-18"), "NO_RECORD");
check("a future blank is NOT an absence", attendanceState(undefined, undefined, "2026-09-30", "2026-09-18"), "FUTURE");
check("today's blank is still only no record", attendanceState(undefined, undefined, "2026-09-18", "2026-09-18"), "NO_RECORD");
check("a check-in beats leave on the same day", attendanceState(IN, OFF, "2026-09-13", "2026-09-18"), "PRESENT");
check("leave spans are inclusive at the start", leaveOn([OFF], "2026-09-12")?.start, "2026-09-12");
check("and inclusive at the end", leaveOn([OFF], "2026-09-14")?.end, "2026-09-14");
check("and do not leak past it", leaveOn([OFF], "2026-09-15"), undefined);
check("every state has a word", Object.values(ATTENDANCE_LABEL).every((v) => v.length > 0), true);

console.log("");
console.log("— the rate divides by days that happened, minus granted leave —");
check("eighteen of twenty", attendanceRate({ present: 18, leave: 0, noRecord: 2 }), 90);
check("leave is not held against them",
  attendanceRate({ present: 10, leave: 10, noRecord: 0 }), 100);
check("a month nobody has worked yet is a dash, not a zero",
  attendanceRate({ present: 0, leave: 0, noRecord: 0 }), null);
check("all leave and nothing else is still not a zero",
  attendanceRate({ present: 0, leave: 5, noRecord: 0 }), null);
check("nobody in at all IS a zero", attendanceRate({ present: 0, leave: 0, noRecord: 5 }), 0);

console.log("");
console.log("— what an advance says about itself —");
check("four months at five thousand", recoveryMonths(20000, 5000), 4);
check("a remainder rounds up, it does not vanish", recoveryMonths(21000, 5000), 5);
check("no plan means no estimate", recoveryMonths(20000, null), null);
check("a zero plan means no estimate", recoveryMonths(20000, 0), null);
check("a negative plan means no estimate", recoveryMonths(20000, -100), null);
check("nothing outstanding means no estimate", recoveryMonths(0, 5000), null);
check("settled says settled", advanceState("2026-09-01T00:00:00Z"), "SETTLED");
check("open says active", advanceState(null), "ACTIVE");

console.log("");
console.log("— search looks where somebody would expect —");
const person = { name: "Priya Nair", craft: "Photographer", email: "priya@vibrnd.in", phone: "+919876543210" };
check("by name", matchesQuery(person, "priya"), true);
check("case does not matter", matchesQuery(person, "NAIR"), true);
check("by role", matchesQuery(person, "photo"), true);
check("by email", matchesQuery(person, "vibrnd.in"), true);
check("by phone", matchesQuery(person, "98765"), true);
check("an empty box matches everyone", matchesQuery(person, "   "), true);
check("and a miss is a miss", matchesQuery(person, "zzz"), false);


console.log("");
console.log("— who may reset whose password —");
const P = (id: string, role: string) => ({ id, role });
const T = (id: string, role: string, isActive = true) => ({ id, role, isActive });

check("an ADMIN resets a TEAM member", mayResetPassword(P("a1", "ADMIN"), T("t1", "TEAM")).ok, true);
check("an ADMIN resets an SMM", mayResetPassword(P("a1", "ADMIN"), T("s1", "SMM")).ok, true);
check("an ADMIN resets a MANAGER", mayResetPassword(P("a1", "ADMIN"), T("m1", "MANAGER")).ok, true);
check("an OWNER resets an ADMIN", mayResetPassword(P("o1", "OWNER"), T("a1", "ADMIN")).ok, true);

console.log("");
console.log("— and the two refusals that matter —");
// Self-reset would route around change-password, which asks for the current
// one first. Without it, an unlocked laptop becomes a permanent takeover.
check("nobody resets their own", mayResetPassword(P("a1", "ADMIN"), T("a1", "ADMIN")).ok, false);
check("…not even an owner", mayResetPassword(P("o1", "OWNER"), T("o1", "OWNER")).ok, false);
// users.manage belongs to ADMIN too, so without this an admin could become
// the owner and hold every capability, including the ones withheld from them.
check("an ADMIN cannot reset the OWNER", mayResetPassword(P("a1", "ADMIN"), T("o1", "OWNER")).ok, false);
check("only an OWNER can reset another OWNER",
  mayResetPassword(P("o1", "OWNER"), T("o2", "OWNER")).ok, true);

console.log("");
console.log("— and nobody below admin resets anybody —");
for (const role of ["MANAGER", "SMM", "TEAM"]) {
  check(`a ${role} cannot reset a password`,
    mayResetPassword(P("x1", role), T("t1", "TEAM")).ok, false);
}
check("a deactivated account is refused rather than pretended at",
  mayResetPassword(P("a1", "ADMIN"), T("t1", "TEAM", false)).ok, false);
check("every refusal says why",
  (["a1", "o1"] as const).every((id) => {
    const v = mayResetPassword(P("a1", "ADMIN"), T(id, id === "o1" ? "OWNER" : "ADMIN"));
    return v.ok === false && typeof v.reason === "string" && v.reason.length > 10;
  }), true);

console.log("");
console.log("— the temporary password itself —");
const temps = Array.from({ length: 200 }, () => generateTemporaryPassword());
check("passes the app's own password rules", temps.every((t) => validatePassword(t) === null), true);
check("is verifiable once hashed", verifyPassword(temps[0], hashPassword(temps[0])), true);
check("a different one does not verify", verifyPassword(temps[1], hashPassword(temps[0])), false);
check("200 draws, 200 distinct values", new Set(temps).size, 200);
// Read down a phone line or copied off a screen. O/0 and I/l/1 are the pairs
// that turn a reset into a support call.
check("no ambiguous characters", temps.every((t) => !/[O0Il1]/.test(t)), true);
check("grouped for transcription", temps.every((t) => /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/.test(t)), true);


console.log(fails === 0 ? "\nAll HR checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
