/**
 * Work out exactly what a database is missing, and write it down for review.
 *
 * Production sits on the pre-v2 baseline: prisma/migrations stops at
 * add_project_members, and everything since — all of v2 and v3 — was applied
 * locally with `prisma db push` plus the hand-written files in
 * prisma/manual-migrations. None of that has ever run against production, so
 * deploying the app without it would leave the code asking for tables that
 * aren't there.
 *
 * Two things are missing, in this order:
 *
 *   1. STRUCTURE — tables, columns, enums, indexes. Derived here by diffing
 *      the live database against prisma/schema.prisma.
 *   2. DATA — the backfills in prisma/manual-migrations. Those files carry
 *      only data movement; they assume the structure already exists, which is
 *      why they must run second.
 *
 * This command is READ-ONLY. It connects to the database to read its shape,
 * writes two reviewable .sql files, and applies nothing.
 *
 *   DATABASE_URL="postgres://…" npx tsx scripts/prepare-production-migration.ts
 *
 * The seed files in that folder are excluded — they insert demo clients and
 * demo projects, and running them against production would put fake agencies
 * in front of real users.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "manual-migrations");
const OUT_DIR = join(process.cwd(), "docs");
const OUT_STRUCTURE = join(OUT_DIR, "PRODUCTION_MIGRATION_1_STRUCTURE.sql");
const OUT_DATA = join(OUT_DIR, "PRODUCTION_MIGRATION_2_DATA.sql");

/**
 * Order matters: phase N assumes phase N-1 ran. Listed explicitly rather than
 * sorted, because "2026-08-phase10" sorts before "2026-08-phase2" and a lexical
 * sort would run them backwards.
 */
const DATA_MIGRATIONS = [
  "2026-07-passwords-and-trial-requests.sql",
  "2026-08-phase1-foundations.sql",
  "2026-08-phase2-task-system.sql",
  "2026-08-phase3-content-calendar.sql",
  "2026-08-phase4-my-calendar.sql",
  "2026-08-phase5-events.sql",
  "2026-08-phase6-packages.sql",
  "2026-08-phase7-invoicing.sql",
  "2026-08-phase8-notifications.sql",
  "2026-08-phase9-bookings.sql",
  "2026-08-phase10-review-links.sql",
  "2026-08-task-board-lists.sql",
  "2026-08-v3-phase0-retire-modules.sql",
  "2026-08-v3-phase1-roles-designations.sql",
  "2026-08-v3-phase2-project-commercial.sql",
  "2026-08-v3-phase3-planning.sql",
  "2026-08-v3-phase4-junior-workspace.sql",
  "2026-08-v3-phase5-review-loop.sql",
  "2026-08-v3-phase6-cycle-close.sql",
  "2026-08-v3-phase7-invoicing.sql",
  "2026-08-v3-fix-smm-designation.sql",
  "2026-08-v3-drop-creative-type-emoji.sql",
];

/** Demo data. Never production. */
const EXCLUDED = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql") && !DATA_MIGRATIONS.includes(f));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the database you want to inspect.\n");
  console.error('  DATABASE_URL="postgres://…" npx tsx scripts/prepare-production-migration.ts');
  process.exit(1);
}

console.log(`Reading schema from ${url.replace(/\/\/[^@]*@/, "//***:***@")}\n`);

// ── 1. structure ──
let structure: string;
try {
  // Prisma 7 dropped --from-url and --to-schema-datamodel. The source is now
  // the datasource in prisma.config.ts, which reads DATABASE_URL — so the env
  // var passed to this command is what gets inspected.
  structure = execFileSync("npx", [
    "prisma", "migrate", "diff",
    "--from-config-datasource",
    "--to-schema", "prisma/schema.prisma",
    "--script",
  ], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: url },
  })
    // The config loader greets on stdout; that line isn't SQL.
    .split("\n")
    .filter((l) => !l.startsWith("Loaded Prisma config"))
    .join("\n")
    .trimStart();
} catch (e) {
  console.error("Could not read the database. Check the URL and that it's reachable.");
  console.error((e as { stderr?: string }).stderr ?? String(e));
  process.exit(1);
}

const destructive = structure
  .split("\n")
  .filter((l) => /\bDROP\s+(TABLE|COLUMN)\b/i.test(l));

/**
 * Tables PART 1 drops, because v3 retired the modules that owned them.
 *
 * This matters for PART 2. The data migrations were written phase by phase,
 * each against the schema as it stood at the time, and several touch tables
 * that were still alive then — an early file does
 * `ALTER TABLE "quotations" DROP CONSTRAINT …`, which was correct in July and
 * is impossible once v3 has dropped the table. Replaying them all after a
 * single jump straight to the final schema means those statements arrive
 * after their subject has gone.
 */
const retiredTables = destructive
  .filter((l) => /DROP\s+TABLE/i.test(l))
  .map((l) => /DROP\s+TABLE\s+"?([\w_]+)"?/i.exec(l)?.[1])
  .filter((t): t is string => !!t);

/**
 * Split SQL into statements the way psql does.
 *
 * A plain `.split(";")` is wrong here: these files contain `DO $$ … END IF; … $$`
 * blocks, and the semicolon inside `END IF;` would cut one in half, leaving a
 * fragment that fails with "syntax error at or near IF". Dollar-quoted blocks
 * and single-quoted strings are tracked so only top-level semicolons split.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "", i = 0, inStr = false, tag: string | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (tag) {
      if (sql.startsWith(tag, i)) { buf += tag; i += tag.length; tag = null; continue; }
    } else if (inStr) {
      if (ch === "'") inStr = false;
    } else {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { tag = m[0]; buf += tag; i += tag.length; continue; }
      if (ch === "'") inStr = true;
      if (ch === ";") { buf += ch; out.push(buf); buf = ""; i++; continue; }
    }
    buf += ch; i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** Statements naming a retired table — dead on arrival, so they're commented out. */
function stripRetired(body: string): { kept: string; removed: number } {
  if (!retiredTables.length) return { kept: body, removed: 0 };
  const re = new RegExp(`\\b(${retiredTables.join("|")})\\b`, "i");
  let removed = 0;
  const kept = splitStatements(body)
    .map((stmt) => {
      const code = stmt.replace(/--[^\n]*/g, "");
      if (code.trim() && re.test(code)) {
        removed++;
        return `\n-- [skipped: targets a table v3 retires]${stmt.replace(/\n/g, "\n-- ")}`;
      }
      return stmt;
    })
    .join("");
  return { kept, removed };
}

// ── 2. data ──
let totalSkipped = 0;
const dataParts = DATA_MIGRATIONS.map((name) => {
  const raw = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
  const { kept, removed } = stripRetired(raw);
  totalSkipped += removed;
  const rule = "-".repeat(66);
  const note = removed ? `\n-- ${removed} statement(s) skipped: retired table(s)` : "";
  return `-- ${rule}\n-- ${name}${note}\n-- ${rule}\n\n${kept}`;
});

const warn = destructive.length
  ? [
      "--",
      `-- !! ${destructive.length} DESTRUCTIVE STATEMENT(S) below drop a table or column:`,
      ...destructive.map((l) => `--      ${l.trim()}`),
      "-- !! If this database holds real data in any of them, that data is gone.",
      "-- !! Take a backup first, and confirm every drop is intended.",
      "--",
    ].join("\n")
  : "--\n-- No destructive statements: nothing is dropped.\n--";

/**
 * Two files, not one, and the split is not cosmetic.
 *
 * PostgreSQL refuses to use a newly-added enum value in the transaction that
 * added it — "unsafe use of new value TEAM of enum type UserRole". The data
 * migrations assign roles that the structure step has only just created, so
 * the two cannot share a transaction. Structure must commit before data runs.
 */
const structureFile = [
  "-- PART 1 of 2: STRUCTURE",
  "-- Generated by scripts/prepare-production-migration.ts",
  "--",
  "-- Tables, columns, enums and indexes the target database is missing,",
  "-- derived by diffing it against prisma/schema.prisma.",
  warn,
  "-- Run this FIRST and let it commit, then run PART 2. They cannot share a",
  "-- transaction: Postgres will not accept a new enum value being used in the",
  "-- same transaction that created it.",
  "--",
  "-- THIS FILE RUNS ONCE. It is a diff, not a migration — re-running it fails",
  "-- on `type \"…\" already exists`. If it half-applies, regenerate against the",
  "-- database as it now stands rather than re-running this copy. (PART 2 is",
  "-- idempotent and can be re-run freely.)",
  "--",
  '--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/PRODUCTION_MIGRATION_1_STRUCTURE.sql',
  "--",
  "SET client_encoding = 'UTF8';",
  "",
  structure,
  "",
].join("\n");

const dataFile = [
  "-- PART 2 of 2: DATA",
  "-- Generated by scripts/prepare-production-migration.ts",
  "--",
  "-- Backfills from prisma/manual-migrations, in dependency order. Every file",
  "-- is idempotent, so re-running this is safe.",
  "--",
  "-- Run AFTER part 1 has committed:",
  '--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/PRODUCTION_MIGRATION_2_DATA.sql',
  "--",
  `-- Seed files excluded (they insert demo agencies): ${EXCLUDED.join(", ") || "none"}`,
  "--",
  "SET client_encoding = 'UTF8';",
  "",
  dataParts.join("\n\n"),
  "",
].join("\n");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_STRUCTURE, structureFile, "utf8");
writeFileSync(OUT_DATA, dataFile, "utf8");

const statementLines = structure.split("\n").filter((l) => l.trim() && !l.startsWith("--")).length;
console.log(`PART 1  structure: ${statementLines} statement line(s)`);
console.log(`PART 2  data:      ${DATA_MIGRATIONS.length} migration file(s)`);
console.log(`excluded seeds:    ${EXCLUDED.length ? EXCLUDED.join(", ") : "none"}`);
if (totalSkipped) {
  console.log(`skipped in PART 2: ${totalSkipped} statement(s) targeting retired table(s) `
    + `(${retiredTables.join(", ")})`);
}
if (destructive.length) {
  console.log(`\n!! ${destructive.length} DESTRUCTIVE statement(s) — these drop tables or columns:`);
  for (const l of destructive) console.log(`   ${l.trim()}`);
  console.log("   Take a backup before applying.");
}
console.log(`\nWrote ${OUT_STRUCTURE}`);
console.log(`Wrote ${OUT_DATA}`);
console.log("Nothing was applied.");
