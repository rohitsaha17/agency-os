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
const canOthers: Record<string, boolean> = {
  OWNER: true, ADMIN: true, MANAGER: true, SMM: false, TEAM: false,
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
