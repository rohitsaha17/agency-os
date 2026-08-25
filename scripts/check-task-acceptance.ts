/**
 * The accept / decline rules.
 *
 * Run after touching lib/task-acceptance.ts or the acceptance route:
 *   npx tsx scripts/check-task-acceptance.ts
 * Exits non-zero on any regression.
 */
import {
  canRespond, canTransition, validateDeclineReason, declineAudience,
  isAwaitingAcceptance, MAX_DECLINE_REASON,
} from "../lib/task-acceptance";

let fails = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const a = (userId: string, acceptance: "PENDING" | "ACCEPTED" | "DECLINED") =>
  ({ userId, acceptance });

console.log("— only the assignee answers —");
check("the assignee may", canRespond(a("u1", "PENDING"), "u1"), true);
check("a colleague may not", canRespond(a("u1", "PENDING"), "u2"), false);
check("an admin may not either", canRespond(a("u1", "PENDING"), "admin"), false);
check("no assignment, no answer", canRespond(undefined, "u1"), false);

console.log("\n— legal moves —");
check("pending -> accepted", canTransition("PENDING", "ACCEPTED"), true);
check("pending -> declined", canTransition("PENDING", "DECLINED"), true);
check("accepting twice is a no-op", canTransition("ACCEPTED", "ACCEPTED"), true);
check("cannot decline after accepting", canTransition("ACCEPTED", "DECLINED"), false);
check("cannot flip a decline yourself", canTransition("DECLINED", "ACCEPTED"), false);
check("cannot re-decline", canTransition("DECLINED", "DECLINED"), false);

console.log("\n— the reason has to be usable —");
check("empty rejected", validateDeclineReason("").ok, false);
check("whitespace rejected", validateDeclineReason("   ").ok, false);
check("'no' too short", validateDeclineReason("no").ok, false);
check("a real reason passes", validateDeclineReason("On leave until the 4th").ok, true);
check("trimmed on the way through",
  validateDeclineReason("  On leave  ").ok && (validateDeclineReason("  On leave  ") as {reason:string}).reason,
  "On leave");
check("absurdly long rejected", validateDeclineReason("x".repeat(MAX_DECLINE_REASON + 1)).ok, false);
check("at the limit accepted", validateDeclineReason("x".repeat(MAX_DECLINE_REASON)).ok, true);
check("non-string rejected", validateDeclineReason(42).ok, false);
check("null rejected", validateDeclineReason(null).ok, false);

console.log("\n— who hears about a decline —");
check("the assigner", declineAudience({ assignedById: "boss", decliningUserId: "u1" }), ["boss"]);
check("manager too when different",
  declineAudience({ assignedById: "boss", managerId: "mgr", decliningUserId: "u1" }), ["boss", "mgr"]);
check("no duplicates when they are the same person",
  declineAudience({ assignedById: "boss", managerId: "boss", approverId: "boss", decliningUserId: "u1" }), ["boss"]);
check("never the person declining",
  declineAudience({ assignedById: "u1", managerId: "mgr", decliningUserId: "u1" }), ["mgr"]);
check("old assignment with no assigner still reaches the manager",
  declineAudience({ assignedById: null, managerId: "mgr", decliningUserId: "u1" }), ["mgr"]);
check("nobody to tell yields an empty list, not a crash",
  declineAudience({ assignedById: null, managerId: null, decliningUserId: "u1" }), []);

console.log("\n— the assigner's view —");
check("pending is awaiting", isAwaitingAcceptance(a("u1", "PENDING")), true);
check("accepted is not", isAwaitingAcceptance(a("u1", "ACCEPTED")), false);
check("declined is not awaiting either", isAwaitingAcceptance(a("u1", "DECLINED")), false);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
