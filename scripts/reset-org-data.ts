/**
 * reset-org-data — empty one or more organizations' DATA, keeping the org,
 * its workspace config, and ONE admin user per org. For handover: give the
 * client a clean, working, empty workspace.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THIS DELETES PRODUCTION DATA AND CANNOT BE UNDONE. TAKE A BACKUP FIRST.
 * (Supabase ▸ Database ▸ Backups, or `pg_dump`.)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * It is DRY-RUN by default: it prints exactly which orgs matched, which admin
 * it would keep for each, and how many rows of each table it would delete —
 * and deletes NOTHING. You only delete when you pass CONFIRM=yes.
 *
 * It is scoped strictly by organizationId, so other tenants in the same
 * database are never touched. Each org is cleared inside its own transaction;
 * any error rolls that org back whole (no half-deleted org).
 *
 * WHAT IS KEPT (scope "a" — operational data only):
 *   • the organization row itself (name, theme, settings, permissions)
 *   • workspace config: creative_types, designation_roles  (+ any KEEP_TABLES)
 *   • exactly one admin user per org (the OWNER, or whoever you name)
 * WHAT IS DELETED: everything else owned by the org — clients, projects,
 *   tasks, content, invoices, billables, expenses, HR (attendance, leave,
 *   payroll, advances), availability, files, channels, notifications, the
 *   other users, and the kept admin's own personal lists/reminders.
 *
 * USAGE (run where the DB is reachable, e.g. your laptop or a Supabase psql):
 *
 *   # 1) DRY RUN — see what would happen, change nothing:
 *   DATABASE_URL='<prod url>' npx tsx scripts/reset-org-data.ts
 *
 *   # 2) If the matched orgs + kept admins look right, execute:
 *   DATABASE_URL='<prod url>' CONFIRM=yes npx tsx scripts/reset-org-data.ts
 *
 * OPTIONS (env vars):
 *   ORG_NAME     substring matched case-insensitively against org name
 *                (default "gloo" — matches BOTH Gloo orgs)
 *   ORG_IDS      comma-separated exact org ids (overrides ORG_NAME)
 *   KEEP_EMAILS  comma-separated emails to keep instead of the auto-picked
 *                admin. Each must belong to one of the matched orgs.
 *   EXPECT_ORGS  if set, the run aborts unless exactly this many orgs matched
 *                (a guard — e.g. EXPECT_ORGS=2)
 *   KEEP_TABLES  extra table names to preserve, on top of the config defaults
 *   CONFIRM=yes  actually delete (otherwise dry run)
 */
import { Pool } from "pg";

const CONFIRM = process.env.CONFIRM === "yes";
const ORG_NAME = process.env.ORG_NAME ?? "gloo";
const ORG_IDS = (process.env.ORG_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const KEEP_EMAILS = new Set(
  (process.env.KEEP_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
const EXPECT_ORGS = process.env.EXPECT_ORGS ? Number(process.env.EXPECT_ORGS) : null;

// Workspace CONFIG that scope "a" preserves. The org row lives in a table with
// no organizationId column so it is never in the delete set, but it is listed
// here too for clarity. creative_types + designation_roles are the config the
// client keeps so the workspace opens ready to use.
const KEEP_TABLES = new Set<string>([
  "organizations",      // the org row: name, theme, settings, permissions
  "creative_types",     // workspace config: the content types
  "designations",       // workspace config: job titles / roles (model DesignationRole)
  ...(process.env.KEEP_TABLES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);

const q = (id: string) => `"${id.replace(/"/g, '""')}"`; // safe identifier quoting

function must(url: string | undefined): string {
  if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
  return url;
}

async function main() {
  const connectionString = must(process.env.DATABASE_URL);
  const isLocal = /(?:localhost|127\.0\.0\.1)/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    connectionTimeoutMillis: 15_000,
  });
  const c = await pool.connect();
  try {
    console.log(`\nMode: ${CONFIRM ? "EXECUTE (will delete)" : "DRY RUN (no changes)"}\n`);

    // 1) Resolve the target orgs.
    const orgs = ORG_IDS.length
      ? (await c.query(`SELECT id, name FROM organizations WHERE id = ANY($1)`, [ORG_IDS])).rows
      : (await c.query(`SELECT id, name FROM organizations WHERE name ILIKE $1 ORDER BY "createdAt"`, [`%${ORG_NAME}%`])).rows;

    if (orgs.length === 0) { console.error("No organizations matched. Check ORG_NAME / ORG_IDS."); process.exit(1); }
    if (EXPECT_ORGS !== null && orgs.length !== EXPECT_ORGS) {
      console.error(`Expected ${EXPECT_ORGS} orgs but matched ${orgs.length}. Aborting.`);
      orgs.forEach((o) => console.error(`   - ${o.name} (${o.id})`));
      process.exit(1);
    }
    console.log(`Matched ${orgs.length} organization(s):`);
    orgs.forEach((o) => console.log(`   - ${o.name}  (${o.id})`));

    // 2) The tables to clear: anything org-scoped, minus the config we keep.
    const orgTables: string[] = (await c.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='organizationId'
       ORDER BY table_name`,
    )).rows.map((r) => r.table_name).filter((t: string) => !KEEP_TABLES.has(t));

    // User-owned child tables with NO organizationId (e.g. personal lists): the
    // kept admin's own rows would otherwise survive, so clear them by userId.
    const userTables: string[] = (await c.query(
      `SELECT c.table_name FROM information_schema.columns c
       WHERE c.table_schema='public' AND c.column_name='userId'
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns o
           WHERE o.table_schema='public' AND o.table_name=c.table_name AND o.column_name='organizationId')
       ORDER BY c.table_name`,
    )).rows.map((r) => r.table_name).filter((t: string) => !KEEP_TABLES.has(t));

    let grandTotal = 0;

    for (const org of orgs) {
      console.log(`\n──────── ${org.name} (${org.id}) ────────`);

      // 3) Resolve the ONE admin to keep.
      const users = (await c.query(
        `SELECT id, email, role FROM users WHERE "organizationId"=$1 ORDER BY "createdAt"`, [org.id],
      )).rows as { id: string; email: string; role: string }[];

      let keep: { id: string; email: string } | undefined;
      if (KEEP_EMAILS.size) {
        const matches = users.filter((u) => KEEP_EMAILS.has(u.email.toLowerCase()));
        if (matches.length === 0) { console.error(`  No KEEP_EMAILS user found in this org. Aborting.`); process.exit(1); }
        if (matches.length > 1) { console.error(`  KEEP_EMAILS matched >1 user in this org; name exactly one per org. Aborting.`); process.exit(1); }
        keep = matches[0];
      } else {
        const owners = users.filter((u) => u.role === "OWNER");
        const admins = users.filter((u) => u.role === "ADMIN");
        const pick = owners.length === 1 ? owners : admins.length === 1 ? admins : [];
        if (pick.length !== 1) {
          console.error(`  Could not auto-pick a single admin (owners=${owners.length}, admins=${admins.length}).`);
          console.error(`  Re-run with KEEP_EMAILS set to the exact admin for this org.`);
          users.forEach((u) => console.error(`     - ${u.role} ${u.email} (${u.id})`));
          process.exit(1);
        }
        keep = pick[0];
      }
      console.log(`  Keeping admin: ${keep.email} (${keep.id}); deleting the other ${users.length - 1} user(s).`);

      const orgUserIds = users.map((u) => u.id);

      // 4) Build the work list: each target table + its delete predicate.
      type Job = { table: string; where: string; params: unknown[] };
      const jobs: Job[] = [];
      for (const t of orgTables) {
        if (t === "users") jobs.push({ table: t, where: `"organizationId"=$1 AND id<>$2`, params: [org.id, keep.id] });
        else jobs.push({ table: t, where: `"organizationId"=$1`, params: [org.id] });
      }
      for (const t of userTables) {
        jobs.push({ table: t, where: `"userId" = ANY($1)`, params: [orgUserIds] });
      }

      // 5) Dry run: count only.
      if (!CONFIRM) {
        let orgTotal = 0;
        for (const j of jobs) {
          const n = Number((await c.query(`SELECT count(*)::int AS n FROM ${q(j.table)} WHERE ${j.where}`, j.params)).rows[0].n);
          if (n > 0) console.log(`    ${j.table.padEnd(26)} ${n}`);
          orgTotal += n;
        }
        console.log(`  → would delete ${orgTotal} row(s) directly (plus cascading children).`);
        grandTotal += orgTotal;
        continue;
      }

      // 6) Execute: one transaction per org, savepoint-retry so delete order
      //    doesn't matter — a job blocked by an FK this pass is retried next pass
      //    once its dependants are gone.
      await c.query("BEGIN");
      try {
        let remaining = [...jobs];
        let pass = 0;
        while (remaining.length) {
          pass++;
          const stillBlocked: Job[] = [];
          let progressed = false;
          for (const j of remaining) {
            await c.query("SAVEPOINT s");
            try {
              const r = await c.query(`DELETE FROM ${q(j.table)} WHERE ${j.where}`, j.params);
              await c.query("RELEASE SAVEPOINT s");
              grandTotal += r.rowCount ?? 0;
              if ((r.rowCount ?? 0) >= 0) progressed = true;
            } catch {
              await c.query("ROLLBACK TO SAVEPOINT s");
              stillBlocked.push(j);
            }
          }
          if (stillBlocked.length && !progressed) {
            await c.query("ROLLBACK");
            console.error(`  FK deadlock — these tables could not be cleared, nothing deleted for this org:`);
            stillBlocked.forEach((j) => console.error(`     - ${j.table}`));
            process.exit(1);
          }
          remaining = stillBlocked;
          if (pass > 50) { await c.query("ROLLBACK"); console.error("  too many passes; aborting"); process.exit(1); }
        }
        // sanity: org + admin survived
        const orgOk = (await c.query(`SELECT 1 FROM organizations WHERE id=$1`, [org.id])).rowCount === 1;
        const adminOk = (await c.query(`SELECT 1 FROM users WHERE id=$1`, [keep.id])).rowCount === 1;
        if (!orgOk || !adminOk) { await c.query("ROLLBACK"); console.error("  post-check failed (org/admin missing); rolled back"); process.exit(1); }
        await c.query("COMMIT");
        console.log(`  ✓ cleared in ${pass} pass(es); org + admin kept.`);
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    }

    console.log(`\n${CONFIRM ? "Done." : "Dry run complete."} ${CONFIRM ? "Deleted" : "Would delete"} ~${grandTotal} row(s) across ${orgs.length} org(s).`);
    if (!CONFIRM) console.log("Re-run with CONFIRM=yes to execute (after a backup).");
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
