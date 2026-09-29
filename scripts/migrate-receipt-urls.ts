/**
 * QA-005 — historical expense-receipt URL migration.
 *
 * BACKGROUND
 * `Expense.receiptUrl` is a plain string. New receipts store the authenticated
 * path `/api/files/<id>/download`. Historical rows may hold a raw Supabase
 * PUBLIC object URL (`…/storage/v1/object/public/<bucket>/<key>`), which stops
 * resolving once the bucket is made private. This tool rewrites those rows to
 * the authenticated path, but ONLY when it can prove a single, same-tenant File
 * owns the object.
 *
 * SAFETY MODEL
 *   - DRY-RUN IS THE DEFAULT. Nothing is written without the explicit `--apply`
 *     flag.
 *   - Writes are tenant-scoped (File.organizationId must equal
 *     Expense.organizationId), limited to rows that are an old public URL with
 *     EXACTLY ONE matching File, and idempotent (an already-migrated row is
 *     skipped, so re-running is safe).
 *   - It NEVER deletes or renames storage objects, never touches File records,
 *     and never changes bucket privacy.
 *   - The database it acts on is whatever DATABASE_URL points at — so pointing
 *     it at production is a deliberate, explicit act by the operator.
 *
 * USAGE
 *   Dry run (default, read-only):
 *     DATABASE_URL=... npx tsx scripts/migrate-receipt-urls.ts
 *   Write (explicit):
 *     DATABASE_URL=... npx tsx scripts/migrate-receipt-urls.ts --apply
 *   Options:
 *     --report <path>   where to write the JSON report (default ./receipt-migration-report.json)
 *     --bucket <name>   override the storage bucket (default $SUPABASE_STORAGE_BUCKET or "uploads")
 */
import { prisma as defaultPrisma, disconnect } from "./_client";
import { writeFileSync } from "fs";

export type Category =
  | "already_migrated"
  | "unambiguous"
  | "ambiguous"
  | "missing_file"
  | "invalid_url";

export interface AnalyzedRow {
  expenseId: string;
  organizationId: string;
  receiptUrl: string;
  category: Category;
  storageKey?: string;
  fileId?: string;
}

export interface MigrationResult {
  counts: Record<Category, number> & { total: number };
  rows: AnalyzedRow[];
  /** Rows actually written (0 in dry-run). */
  applied: number;
}

/** Build the "public object URL" matcher for a bucket. Host-agnostic. */
export function publicUrlKey(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const key = url.slice(i + marker.length);
  return key.length > 0 ? key : null;
}

/** The authenticated path a migrated receipt should point at. */
export function authPath(fileId: string): string {
  return `/api/files/${fileId}/download`;
}

/**
 * Analyze every expense receipt and, when `apply` is true, rewrite the
 * unambiguous old-public rows. Pure w.r.t. the DB unless `apply` is true.
 */
export async function analyzeAndMaybeApply(opts: {
  apply?: boolean;
  bucket?: string;
  client?: typeof defaultPrisma;
}): Promise<MigrationResult> {
  const apply = opts.apply ?? false;
  const bucket = opts.bucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? "uploads";
  const db = opts.client ?? defaultPrisma;

  const expenses = await db.expense.findMany({
    where: { receiptUrl: { not: null } },
    select: { id: true, organizationId: true, receiptUrl: true },
  });

  const rows: AnalyzedRow[] = [];
  const updates: { expenseId: string; organizationId: string; fileId: string }[] = [];

  for (const e of expenses) {
    const url = (e.receiptUrl ?? "").trim();
    if (!url) continue; // empty string — nothing to migrate
    const base = { expenseId: e.id, organizationId: e.organizationId, receiptUrl: url };

    if (url.startsWith("/api/files/")) {
      rows.push({ ...base, category: "already_migrated" });
      continue;
    }
    const key = publicUrlKey(url, bucket);
    if (!key) {
      // Not a public storage URL (external link, relative path, junk).
      rows.push({ ...base, category: "invalid_url" });
      continue;
    }
    // Tenant-scoped match: the File must belong to the SAME organization.
    const files = await db.file.findMany({
      where: { s3Key: key, organizationId: e.organizationId },
      select: { id: true },
    });
    if (files.length === 0) {
      rows.push({ ...base, category: "missing_file", storageKey: key });
    } else if (files.length > 1) {
      rows.push({ ...base, category: "ambiguous", storageKey: key });
    } else {
      rows.push({ ...base, category: "unambiguous", storageKey: key, fileId: files[0].id });
      updates.push({ expenseId: e.id, organizationId: e.organizationId, fileId: files[0].id });
    }
  }

  let applied = 0;
  if (apply && updates.length) {
    // Batched transactions. Each update is tenant-scoped and re-guards that the
    // row is STILL the exact old public URL (optimistic — makes it idempotent
    // and race-safe: a row already changed by a concurrent run is skipped).
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      const res = await db.$transaction(
        slice.map((u) =>
          db.expense.updateMany({
            where: {
              id: u.expenseId,
              organizationId: u.organizationId,
              receiptUrl: rows.find((r) => r.expenseId === u.expenseId)!.receiptUrl,
            },
            data: { receiptUrl: authPath(u.fileId) },
          }),
        ),
      );
      applied += res.reduce((n, r) => n + r.count, 0);
    }
  }

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.category]++;
      acc.total++;
      return acc;
    },
    { already_migrated: 0, unambiguous: 0, ambiguous: 0, missing_file: 0, invalid_url: 0, total: 0 } as MigrationResult["counts"],
  );

  return { counts, rows, applied };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function isMain(): boolean {
  return !!process.argv[1] && process.argv[1].includes("migrate-receipt-urls");
}

async function cli() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const reportPath = args[args.indexOf("--report") + 1] && args.includes("--report")
    ? args[args.indexOf("--report") + 1]
    : "./receipt-migration-report.json";
  const bucket = args.includes("--bucket") ? args[args.indexOf("--bucket") + 1] : undefined;

  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").host || "(unknown)"; } catch { return "(unparseable)"; }
  })();
  console.log(`receipt-url migration — mode: ${apply ? "APPLY (writes enabled)" : "DRY-RUN (read-only)"}`);
  console.log(`database host: ${host}`);
  if (apply) console.log("⚠️  --apply set: unambiguous old-public receipt URLs WILL be rewritten.");

  const result = await analyzeAndMaybeApply({ apply, bucket });
  console.log("\ncounts:", JSON.stringify(result.counts, null, 2));
  console.log(`written: ${result.applied}${apply ? "" : " (dry-run — no writes)"}`);

  // Export the rows that need human attention.
  const problems = result.rows.filter((r) => r.category === "ambiguous" || r.category === "missing_file" || r.category === "invalid_url");
  writeFileSync(reportPath, JSON.stringify({ counts: result.counts, applied: result.applied, problems }, null, 2));
  console.log(`report (problem rows) written to ${reportPath}`);
}

if (isMain()) {
  cli().then(disconnect).catch((e) => { console.error(e); process.exitCode = 1; });
}
