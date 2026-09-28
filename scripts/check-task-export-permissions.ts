/**
 * Who may print whose task sheet.
 *
 * `mayExportTasksFor` decides whose NAME may head a document, which is a
 * different question from which rows the database will return, and it is the
 * kind of rule that quietly rots when roles are added. Run it after touching
 * the capability matrix or the export route:
 *
 *   npx tsx scripts/check-task-export-permissions.ts
 *
 * Exits non-zero on any regression, so it can be wired into CI.
 */
import { mayExportTasksFor } from "../lib/api-permissions";

let fails = 0;
const check = (name: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${got}, want ${want})`);
};

const u = (role: string) => ({ id: "me", role });
const ROLES = ["OWNER", "ADMIN", "MANAGER", "SMM", "TEAM"];

console.log("— own sheet: everyone, always —");
for (const r of ROLES) {
  check(`${r} · userId="" (implicit self)`, mayExportTasksFor(u(r), ""), true);
  check(`${r} · userId="me" (explicit self)`, mayExportTasksFor(u(r), "me"), true);
}

console.log("\n— somebody else's sheet —");
/*
 * SMM was false here, and the reason it was false has gone.
 *
 * The rule this file guards is not "only managers export". It is that nobody
 * receives a sheet headed with a colleague's name and filled with nothing,
 * because they cannot see that colleague's work — a document that
 * misrepresents itself rather than a leak.
 *
 * An SMM now holds tasks.viewAll, so the sheet they would get is the list
 * they are already looking at on screen. Refusing the PDF of it would protect
 * nothing and leave an export button that 403s.
 *
 * TEAM stays false, and that is the case the rule was written for.
 */
const canOthers: Record<string, boolean> = {
  OWNER: true, ADMIN: true, MANAGER: true, SMM: true, TEAM: false,
};
for (const r of ROLES) {
  check(`${r} · a colleague`, mayExportTasksFor(u(r), "someone-else"), canOthers[r]);
  check(`${r} · "all"`, mayExportTasksFor(u(r), "all"), canOthers[r]);
}

console.log("\n— edge cases —");
check("unknown role cannot read others", mayExportTasksFor(u("WHAT"), "someone-else"), false);
check("deprecated MEMBER cannot read others", mayExportTasksFor(u("MEMBER"), "someone-else"), false);
check("null role cannot read others", mayExportTasksFor({ id: "me", role: null }, "x"), false);
check("null role can still read own", mayExportTasksFor({ id: "me", role: null }, ""), true);
check("TEAM naming its own id is fine", mayExportTasksFor(u("TEAM"), "me"), true);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
