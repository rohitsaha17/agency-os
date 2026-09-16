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
  monthKey, isMonthKey, outstanding, payslip,
} from "../lib/hr";
import { can } from "../lib/permissions";

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

console.log("\n— check-in is for today, once —");
const NOW = new Date("2026-09-16T09:30:00Z");
check("today is allowed", canSelfCheckIn("2026-09-16", NOW), null);
check("tomorrow is refused", !!canSelfCheckIn("2026-09-17", NOW), true);
check("yesterday is refused — an admin adds it instead", !!canSelfCheckIn("2026-09-15", NOW), true);
check("late tonight still counts as today", canSelfCheckIn("2026-09-16T23:00:00Z", NOW), null);

console.log("\n— decisions —");
check("pending can be decided", canDecide("PENDING"), true);
check("approved cannot be decided again", canDecide("APPROVED"), false);
check("rejected cannot be decided again", canDecide("REJECTED"), false);
check("own pending request can be withdrawn", canCancel("PENDING", true), true);
check("somebody else's cannot", canCancel("PENDING", false), false);
check("a decided request is a record, not a draft", canCancel("APPROVED", true), false);

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
check("a half-loaded user gets nothing", can(null, "payroll.manage"), false);
check("an unknown role gets nothing", can({ id: "x", role: "INTERN" }, "payroll.manage"), false);

console.log(fails === 0 ? "\nAll HR checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
