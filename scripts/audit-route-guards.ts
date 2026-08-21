/**
 * Static audit: which API handlers decide who may call them, and which don't.
 *
 * Every hole found so far had the same shape — a route that called requireAuth
 * and nothing else, so "is this person signed in" stood in for "may this
 * person do this". POST /api/channels, POST /api/projects and PATCH
 * /api/settings/company were all found one screenshot at a time. This finds
 * them all at once, and can be re-run after any change.
 *
 *   npx tsx scripts/audit-route-guards.ts
 *
 * Exits non-zero when an unreviewed mutating handler has no authorization
 * check, so it can gate a commit.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const API_DIR = join(process.cwd(), "app", "api");
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
type Method = (typeof METHODS)[number];

/** Anything that decides *who* may call, as opposed to merely who they are. */
const GUARD_PATTERNS = [
  /requireCapability\s*\(/,
  /requireRole\s*\(/,
  /requirePlatformAdmin\s*\(/,
  /\bcan\s*\(\s*user/,
  /\bcan\s*\(\s*caller/,
  /canViewFinancials\s*\(/,
  /canAssignToUser\s*\(/,
  /assertMayGrant\s*\(/,
  /isHeadOfDesign\s*\(/,
  /taskVisibilityScope\s*\(/,
  /mayEdit/,
  /plansThisProject/,
  // Some routes decide inline rather than through a helper — e.g. submit
  // checks isAssignee and throws. A 403 raised in the handler IS an
  // authorization decision, so it counts.
  /ApiError\([^)]*,\s*403/,
  /apiError\([^)]*,\s*403/,
];

/**
 * Handlers that are correct with authentication alone, and why.
 * Anything not listed here and not guarded is reported.
 */
const REVIEWED_OPEN: Record<string, string> = {
  "auth/login/route.ts:POST": "signing in is how you get a session",
  "auth/logout/route.ts:POST": "ending your own session",
  "auth/me/route.ts:GET": "reading your own identity",
  "auth/change-password/route.ts:POST": "changing your own password",
  "auth/set-password/route.ts:POST": "first-run password set, token-scoped",
  "notifications/route.ts:GET": "your own notifications",
  "notifications/route.ts:PATCH": "marking your own notifications read",
  "notifications/[id]/route.ts:PATCH": "your own notification",
  "personal-items/route.ts:GET": "your own reminders",
  "personal-items/route.ts:POST": "your own reminders",
  "personal-items/[id]/route.ts:PATCH": "your own reminder",
  "personal-items/[id]/route.ts:DELETE": "your own reminder",
  "my-calendar/route.ts:GET": "your own calendar",
  "creative-types/route.ts:GET": "reference data every picker needs",
  "designations/route.ts:GET": "reference data every picker needs",
  "permissions/matrix/route.ts:GET": "the matrix is documentation, not data",
  "settings/company/route.ts:GET": "org name and letterhead render in the chrome",
  "channels/unread-count/route.ts:GET": "your own unread count",

  // Doing the work you were given, and talking about it.
  "tasks/[id]/comments/route.ts:POST": "anyone on a task may write in its thread",
  "tasks/[id]/comments/[commentId]/route.ts:DELETE": "deleting your own comment",
  "tasks/[id]/time-entries/route.ts:POST": "logging time on your own task",
  "tasks/[id]/delivery/route.ts:POST": "attaching proof to work you finished",
  "tasks/[id]/dependencies/route.ts:POST": "linking two tasks you can already see",
  "tasks/[id]/dependencies/[depId]/route.ts:DELETE": "unlinking two tasks you can see",
  "tasks/[id]/change-requests/route.ts:PATCH": "resolving a change request on your task",
  "tasks/my-order/route.ts:PATCH": "the order of your own list",
  "tasks/reorder/route.ts:POST": "reordering a board you can already see",
  "task-lists/route.ts:POST": "your own lists",
  "task-lists/[id]/route.ts:PATCH": "your own list",
  "task-lists/[id]/route.ts:DELETE": "your own list",
  "notifications/read-all/route.ts:POST": "marking your own notifications read",
  "notifications/[id]/read/route.ts:PATCH": "your own notification",
  "channels/[id]/messages/route.ts:POST": "posting in a channel you're a member of",

  // Files: uploading and commenting are collaboration. Renaming, deleting and
  // approving are not, and are gated above.
  "files/route.ts:POST": "uploading a deliverable is the job",
  "files/[id]/versions/route.ts:POST": "adding a version to a file you can see",
  "files/[id]/comments/route.ts:POST": "review comments are the point of review",
  "files/[id]/comments/[commentId]/route.ts:PATCH": "editing your own comment",
  "files/[id]/comments/[commentId]/route.ts:DELETE": "deleting your own comment",
  "files/[id]/comments/[commentId]/task/route.ts:POST": "turning a review note into a task",

  // Not session-authenticated at all — a share token or a cron secret.
  "review/[token]/route.ts:POST": "token-scoped client review link, no session",
  "trial-request/route.ts:POST": "public sign-up form",
  "jobs/scan-reminders/route.ts:POST": "cron entry point, guarded by its own secret",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** The source of one exported handler, from its signature to the next export. */
function handlerBody(src: string, method: Method): string | null {
  const re = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index);
  const next = rest.slice(1).search(/\nexport\s+(async\s+)?function\s/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

interface Row {
  route: string;
  method: Method;
  guarded: boolean;
  reviewed: string | null;
  authOnly: boolean;
}

/**
 * Local helpers that make the authorization decision on a handler's behalf —
 * e.g. `assertCanClose()`, whose body calls requireCapability. A handler that
 * calls one is guarded, even though no check is written inline.
 */
function guardingHelpers(src: string): string[] {
  const names: string[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1];
    if ((METHODS as readonly string[]).includes(name)) continue;
    const rest = src.slice(m.index);
    const next = rest.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s/);
    const body = next === -1 ? rest : rest.slice(0, next + 1);
    if (GUARD_PATTERNS.some((p) => p.test(body))) names.push(name);
  }
  return names;
}

const rows: Row[] = [];
for (const file of walk(API_DIR)) {
  const src = readFileSync(file, "utf8");
  const route = relative(API_DIR, file).replace(/\\/g, "/");
  const helpers = guardingHelpers(src);
  for (const method of METHODS) {
    const body = handlerBody(src, method);
    if (!body) continue;
    const key = `${route}:${method}`;
    const viaHelper = helpers.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(body));
    rows.push({
      route,
      method,
      guarded: GUARD_PATTERNS.some((p) => p.test(body)) || viaHelper,
      reviewed: REVIEWED_OPEN[key] ?? null,
      authOnly: /requireAuth\s*\(/.test(body),
    });
  }
}

const mutating = (r: Row) => r.method !== "GET";
const unguarded = rows.filter((r) => !r.guarded && !r.reviewed);
const problems = unguarded.filter(mutating);

// ── report ──
const lines: string[] = [
  "# Route authorization audit",
  "",
  "Generated by `npx tsx scripts/audit-route-guards.ts`.",
  "",
  "Every API handler, and whether it decides *who* may call it rather than",
  "just whether they're signed in. A mutating handler with no check is a hole:",
  "that is exactly how creating a channel, creating a project and editing org",
  "settings ended up available to everyone.",
  "",
  `Handlers: **${rows.length}** · guarded: **${rows.filter((r) => r.guarded).length}** · `
    + `reviewed-open: **${rows.filter((r) => r.reviewed).length}** · `
    + `unguarded writes: **${problems.length}**`,
  "",
];

if (problems.length) {
  lines.push("## Unguarded mutating handlers", "");
  lines.push("| Route | Method |", "|---|---|");
  for (const r of problems) lines.push(`| \`${r.route}\` | ${r.method} |`);
  lines.push("");
}

const openReads = unguarded.filter((r) => !mutating(r));
if (openReads.length) {
  lines.push(
    "## Reads open to any signed-in user",
    "",
    "Not automatically wrong — most reads are scoped by organization, and some",
    "are deliberately shared. Listed so the choice stays visible.",
    "",
    "| Route | Method |", "|---|---|",
  );
  for (const r of openReads) lines.push(`| \`${r.route}\` | ${r.method} |`);
  lines.push("");
}

lines.push("## Reviewed as intentionally open", "", "| Handler | Why |", "|---|---|");
for (const [key, why] of Object.entries(REVIEWED_OPEN)) lines.push(`| \`${key}\` | ${why} |`);
lines.push("");

mkdirSync(join(process.cwd(), "docs"), { recursive: true });
writeFileSync(join(process.cwd(), "docs", "ROUTE_GUARD_AUDIT.md"), lines.join("\n"), "utf8");

console.log(`${rows.length} handlers · ${rows.filter((r) => r.guarded).length} guarded · `
  + `${rows.filter((r) => r.reviewed).length} reviewed-open`);
console.log(`unguarded writes: ${problems.length}`);
for (const r of problems) console.log(`  ${r.method.padEnd(6)} ${r.route}`);
console.log(`\nWrote docs/ROUTE_GUARD_AUDIT.md`);

process.exit(problems.length ? 1 : 0);
