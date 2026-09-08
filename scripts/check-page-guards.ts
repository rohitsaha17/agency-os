/**
 * Every capability-gated nav entry must have a page-level guard.
 *
 * The sidebar hides a link when the role lacks the capability, and for a long
 * time that was the whole story — which meant the URL still worked. Anyone who
 * followed a pasted link, a bookmark, or a browser suggestion landed on a fully
 * rendered page whose every request came back 403. It read as "you have no
 * clients" rather than "this isn't yours to see".
 *
 * This reads the capability out of Sidebar.tsx rather than repeating the list,
 * so adding a gated page to the nav and forgetting the guard fails here instead
 * of shipping.
 *
 *   npx tsx scripts/check-page-guards.ts
 */
import { readFileSync, existsSync } from "fs";

const sidebar = readFileSync("components/layout/Sidebar.tsx", "utf8");

// { href: "/clients", label: …, icon: …, need: "clients.manage" }
const entries = [...sidebar.matchAll(
  /href:\s*"(\/[a-z0-9-]*)"[^}]*?need:\s*"([a-z.]+)"/gi,
)].map(([, href, need]) => ({ href, need }));

let fails = 0;
console.log(`— ${entries.length} gated nav entries —`);

for (const { href, need } of entries) {
  const path = `app/(dashboard)${href}/page.tsx`;
  if (!existsSync(path)) {
    console.log(`SKIP  ${href} — no page file (${path})`);
    continue;
  }
  const src = readFileSync(path, "utf8");
  const guard = src.match(/<RequireCapability\s+capability="([a-z.]+)"/);
  if (!guard) {
    fails++;
    console.log(`FAIL  ${href} needs "${need}" in the nav but the page has no RequireCapability`);
  } else if (guard[1] !== need) {
    // A guard that asks for a different capability than the nav is worse than
    // none: the two disagree about who this page is for.
    fails++;
    console.log(`FAIL  ${href} — nav gates on "${need}", page guards "${guard[1]}"`);
  } else {
    console.log(`PASS  ${href} → ${need}`);
  }
}

console.log(fails === 0 ? "\nAll gated pages guarded." : `\n${fails} unguarded.`);
process.exit(fails === 0 ? 0 : 1);
