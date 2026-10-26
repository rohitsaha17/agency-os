/**
 * Limited-access job titles (shoot crew) — the rules that must not drift.
 *
 *   npx tsx scripts/check-limited-access.ts
 *
 * The danger here is a split brain: the nav hides a module but the page still
 * opens, or vice versa. So the allowlist is ONE function (limitedAccessAllows)
 * and this check proves (1) it says yes to exactly the five modules + Dashboard
 * and no to the rest, and (2) both the rail and the page guard actually go
 * through it, and the guard is actually mounted.
 */
import { readFileSync } from "fs";
import { isLimitedAccess, limitedAccessAllows } from "../lib/permissions";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      ${detail}`}`);
};

console.log("— isLimitedAccess reads the job-title flag —");
check("flagged title → limited", isLimitedAccess({ jobTitle: { limitedAccess: true } }));
check("unflagged title → not limited", !isLimitedAccess({ jobTitle: { limitedAccess: false } }));
check("no title → not limited", !isLimitedAccess({ jobTitle: null }));
check("no user → not limited", !isLimitedAccess(null));

console.log("\n— the allowlist is exactly the confirmed modules —");
const ALLOWED = ["/", "/tasks", "/tasks/abc123", "/my-calendar", "/calendar", "/hr", "/hr?tab=shoots", "/notifications", "/settings", "/settings?tab=account"];
const DENIED = ["/projects", "/projects/abc", "/messages", "/files", "/clients", "/invoices", "/expenses", "/contracts", "/reports", "/activity", "/approvals", "/tasksfoo"];
for (const p of ALLOWED) check(`allows ${p}`, limitedAccessAllows(p.split("?")[0]));
for (const p of DENIED) check(`denies ${p}`, !limitedAccessAllows(p.split("?")[0]));

console.log("\n— nav and guard both go through limitedAccessAllows (no drift) —");
const sidebar = safeRead("components/layout/Sidebar.tsx");
const guard = safeRead("components/layout/LimitedAccessGuard.tsx");
const layout = safeRead("app/(dashboard)/layout.tsx");
check("Sidebar filters nav with limitedAccessAllows", sidebar.includes("limitedAccessAllows"),
  "the rail must hide links through the shared allowlist, not a private copy.");
check("Sidebar bottom nav is limited-aware", sidebar.includes("isLimitedAccess(appUser)"),
  "the mobile bottom bar must swap its items for limited users too.");
check("Guard uses the shared allowlist", guard.includes("limitedAccessAllows") && guard.includes("isLimitedAccess"),
  "the page guard must turn users away through the same function the nav uses.");
check("Guard is mounted in the dashboard layout", layout.includes("<LimitedAccessGuard"),
  "a guard that is never mounted guards nothing.");

function safeRead(p: string): string {
  try { return readFileSync(p, "utf8"); } catch { return ""; }
}

console.log(fails === 0 ? "\nAll limited-access checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
