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
import { maySetAvailability, mayReadAvailability } from "../lib/api-permissions";

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
check("SMM sees who is in", can(U("SMM"), "hr.view"), true);
check("SMM does not manage staff records", can(U("SMM"), "hr.manage"), false);
check("SMM does not see salary", can(U("SMM"), "payroll.manage"), false);
check("TEAM checks themselves in", can(U("TEAM"), "attendance.mark"), true);
check("TEAM does not see the team board", can(U("TEAM"), "hr.view"), false);
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

console.log(fails === 0 ? "\nAll HR checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
