/**
 * Self-service profile — the rules the client asked for, guarded against drift.
 *
 *   npx tsx scripts/check-profile-self-service.ts
 *
 * The one that matters most: an employee editing their own details must NOT be
 * able to set their Date of Joining — that is an HR fact only an admin enters.
 * The self route (/api/users/me) must never write dateOfJoining, while the admin
 * route (/api/hr/staff) must. Plus the new fields (blood group, photo) must be
 * wired on both sides. All static source scans — cheap, and they fail loudly if
 * a later refactor reopens the hole.
 */
import { readFileSync } from "fs";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      ${detail}`}`);
};
const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const me = read("app/api/users/me/route.ts");
const staff = read("app/api/hr/staff/route.ts");
const avatar = read("app/api/users/me/avatar/route.ts");
const serve = read("app/api/users/[id]/avatar/route.ts");

console.log("— Date of joining is admin-only —");
check("self route does NOT write dateOfJoining from the body",
  !/dateOfJoining:\s*parseDate\(p\.dateOfJoining\)/.test(me) && !/\bp\.dateOfJoining\b/.test(me),
  "PATCH /api/users/me must not read or write dateOfJoining — that would let an employee set their own joining date.");
check("admin route DOES write dateOfJoining", /dateOfJoining:\s*day\(body\.dateOfJoining\)/.test(staff),
  "PATCH /api/hr/staff is where the admin sets the joining date; that write is missing.");

console.log("\n— blood group wired end to end —");
check("self route writes bloodGroup", /bloodGroup/.test(me));
check("admin route reads bloodGroup (BASE_PROFILE)", /bloodGroup:\s*true/.test(staff));
check("admin route writes bloodGroup", /bloodGroup:\s*str\(body\.bloodGroup/.test(staff));

console.log("\n— profile photo upload + serving —");
check("upload route exists", avatar.length > 0);
check("upload validates it is an image", /OK_TYPES|image\//.test(avatar));
check("upload caps the size", /MAX_BYTES|5 \* 1024 \* 1024/.test(avatar));
check("upload stores a key and sets avatarUrl", /avatarKey:\s*stored\.key/.test(avatar) && /avatarUrl/.test(avatar));
check("serving route is org-scoped + auth", /requireAuth/.test(serve) && /organizationId:\s*user\.organizationId/.test(serve));

console.log(fails === 0 ? "\nAll profile self-service checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
