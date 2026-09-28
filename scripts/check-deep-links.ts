/**
 * Every deep link the app sends must be read by the page it points at.
 *
 *   npx tsx scripts/check-deep-links.ts
 *
 * This exists because seven different places built /projects/<id>?task=<id>
 * — the notification when work is assigned, the one when it is declined, the
 * missed-deadline report, the client review link, the approvals queue — and
 * nothing on the project page ever read `task`. Every one of those links
 * opened the project on its default tab with nothing selected, which reads as
 * the link being broken or the work having vanished.
 *
 * Nothing failed. No error was thrown, no request 404'd, no type was wrong.
 * A parameter was simply ignored, and the only way to notice was to follow a
 * link and recognise that the page you landed on was not about the thing you
 * clicked. So it is asserted here instead.
 *
 * The check is deliberately blunt: it matches on the query parameter being
 * built anywhere, and on the destination page reading that name. It cannot
 * tell whether the page does something SENSIBLE with it — only that the value
 * is not dropped on the floor, which is the failure that actually happened.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

type Contract = {
  /** What the link looks like where it is built. */
  param: string;
  /** Where it lands. */
  page: string;
  /** Roughly, what the destination has to contain to be reading it. */
  reads: RegExp;
  why: string;
};

const CONTRACTS: Contract[] = [
  {
    param: "task",
    page: "app/(dashboard)/tasks/page.tsx",
    reads: /searchParams\.get\(["']task["']\)/,
    why: "/tasks?task=<id> must open that task",
  },
  {
    param: "task",
    page: "app/(dashboard)/projects/[id]/page.tsx",
    reads: /get\(["']task["']\)/,
    why: "/projects/<id>?task=<id> must open that task",
  },
  {
    param: "tab",
    page: "app/(dashboard)/projects/[id]/page.tsx",
    reads: /get\(["']tab["']\)/,
    why: "/projects/<id>?tab=<name> must select that tab",
  },
];

const ROOTS = ["app", "lib", "components"];
const EXT = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const sources = new Map(files.map((f) => [f.replace(/\\/g, "/"), readFileSync(f, "utf8")]));

let fails = 0;
const check = (n: string, ok: boolean, detail?: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok || !detail ? "" : `\n      ${detail}`}`);
};

console.log("— a link that is built is a link that is read —");
for (const c of CONTRACTS) {
  /*
    Who builds it. Any `?name=` or `&name=`, interpolated or literal.

    The first version matched only `?name=${`, so `?tab=plan` — a literal
    value — was invisible and the tab contract reported SKIP while checking
    nothing at all. A check that quietly tests nothing is worse than no
    check, because it reads as a pass.
  */
  const builder = new RegExp(`[?&]${c.param}=`);
  const builders = [...sources.entries()]
    .filter(([path, src]) => builder.test(src) && !path.endsWith("check-deep-links.ts"))
    .map(([path]) => path);

  if (builders.length === 0) {
    console.log(`SKIP  nothing builds ?${c.param}= for ${c.page}`);
    continue;
  }

  const page = sources.get(c.page);
  check(
    `${c.why}  (${builders.length} place${builders.length === 1 ? "" : "s"} build it)`,
    !!page && c.reads.test(page),
    page
      ? `${c.page} never reads "${c.param}". Built in: ${builders.slice(0, 4).join(", ")}`
      : `${c.page} not found`,
  );
}

console.log("");
console.log("— and the one that goes by another name —");
// auto-tasks sends acceptTask= rather than task= on purpose: the bell offers
// Accept before sending anybody on, and `task=` would open the panel over
// that prompt. The bell is the reader, so that is where it has to be handled.
const bell = sources.get("components/notifications/NotificationBell.tsx");
check(
  "acceptTask is understood by the notification bell",
  !!bell && /acceptTask/.test(bell),
  "NotificationBell must recognise acceptTask, or that link does nothing",
);

console.log(fails === 0 ? "\nAll deep-link checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
