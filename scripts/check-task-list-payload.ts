/**
 * The task list withholds four fields. Everything that reads them must get
 * them somewhere else.
 *
 * GET /api/tasks returns every task in the org, completed ones included, and
 * the board refetches it every 25 seconds. Four columns on Task are unbounded
 * free text — the description, the SMM's brief, the topic and the extra note —
 * and they were the payload. They are now omitted, and TaskPanel fetches the
 * one task it is showing instead.
 *
 * That split is only safe while it stays true. If someone renders
 * `task.content` in a list row, it is `undefined` — no type error, no crash,
 * just a brief that silently isn't there. This checks the two halves still
 * match:
 *
 *   1. the omit list in the route is exactly the set below
 *   2. nothing that renders a LIST task reads one of them
 *   3. TaskPanel still fetches the detail that compensates
 *
 *   npx tsx scripts/check-task-list-payload.ts
 */
import { readFileSync } from "fs";

const WITHHELD = ["description", "content", "topic", "extraNote"];

/**
 * The same split, applied to the other list endpoints that return tasks.
 * `/api/projects/[id]/tasks` keeps `description` because the shared Task type
 * requires it and it is a line rather than a brief.
 */
const ALSO_WITHHOLDING: Array<[string, string[]]> = [
  ["app/api/projects/[id]/tasks/route.ts", ["content", "topic", "extraNote"]],
  ["app/api/tasks/approvals/route.ts", ["description", "content", "topic", "extraNote"]],
];

/** Files that render a task straight from the list response. */
const LIST_CONSUMERS = [
  "app/(dashboard)/tasks/page.tsx",
  "components/tasks/TaskList.tsx",
  "components/tasks/TaskModal.tsx",
];

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

// ── 1. The route withholds exactly these ──
const route = readFileSync("app/api/tasks/route.ts", "utf8");
const omitBlock = route.match(/omit:\s*\{([^}]*)\}/);
check(!!omitBlock, "GET /api/tasks has an omit block");

if (omitBlock) {
  const omitted = [...omitBlock[1].matchAll(/(\w+)\s*:\s*true/g)].map((m) => m[1]).sort();
  const expected = [...WITHHELD].sort();
  check(
    JSON.stringify(omitted) === JSON.stringify(expected),
    `omits exactly [${expected.join(", ")}]` +
      (JSON.stringify(omitted) === JSON.stringify(expected) ? "" : ` — found [${omitted.join(", ")}]`),
  );
}

// ── 2. Nothing rendering a list row reads one ──
for (const file of LIST_CONSUMERS) {
  const src = readFileSync(file, "utf8");
  for (const field of WITHHELD) {
    // `task.content`, `t.content`, `x?.content` — any short task-ish variable.
    const hit = new RegExp(String.raw`\b(?:task|t|x|item|child|sub|row)\??\.${field}\b`).exec(src);
    check(!hit, `${file.split("/").pop()} does not read .${field}${hit ? ` — found "${hit[0]}"` : ""}`);
  }
}

// ── 3. The panel still asks for what the list stopped sending ──
const panel = readFileSync("components/tasks/TaskPanel.tsx", "utf8");
check(
  /fetch\(`\/api\/tasks\/\$\{task\.id\}`\)/.test(panel),
  "TaskPanel fetches GET /api/tasks/[id] for the full record",
);
for (const field of WITHHELD.filter((f) => f !== "description")) {
  check(
    !new RegExp(String.raw`\btask\.${field}\b`).test(panel),
    `TaskPanel renders ${field} from the merged record, not the list row`,
  );
}

// ── 4. The other task lists withhold the brief too ──
for (const [file, fields] of ALSO_WITHHOLDING) {
  const src = readFileSync(file, "utf8");
  const block = src.match(/omit:\s*\{([^}]*)\}/);
  const omitted = block ? [...block[1].matchAll(/(\w+)\s*:\s*true/g)].map((m) => m[1]).sort() : [];
  const want = [...fields].sort();
  check(
    JSON.stringify(omitted) === JSON.stringify(want),
    `${file.replace("app/api/", "").replace("/route.ts", "")} omits [${want.join(", ")}]` +
      (JSON.stringify(omitted) === JSON.stringify(want) ? "" : ` — found [${omitted.join(", ")}]`),
  );
}

// ── 5. content-items must not go back to the whole creativeType row ──
for (const file of ["app/api/content-items/route.ts", "app/api/content-items/[id]/route.ts"]) {
  const src = readFileSync(file, "utf8");
  check(
    !/creativeType:\s*true/.test(src),
    `${file.replace("app/api/", "").replace("/route.ts", "")} selects creativeType fields rather than the whole row`,
  );
}

// ── 6. expenses withholds the description nothing renders ──
const expenses = readFileSync("app/api/expenses/route.ts", "utf8");
check(/omit:\s*\{\s*description:\s*true\s*\}/.test(expenses),
  "GET /api/expenses omits description (notes stays — the client page shows it)");

// ── 7. The detail route must not have picked up an omit of its own ──
const detail = readFileSync("app/api/tasks/[id]/route.ts", "utf8");
check(!/omit:\s*\{/.test(detail), "GET /api/tasks/[id] still returns the full record");

console.log(fails === 0 ? "\nList and detail agree." : `\n${fails} problem(s).`);
process.exit(fails === 0 ? 0 : 1);
