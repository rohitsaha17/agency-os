/**
 * V3 Phase 0 — export the modules being retired, BEFORE they are deleted.
 *
 * Quotations, Rate Cards, Stakeholders and Bookings leave the product in v3
 * (docs/V3_CONTEXT.md §3). Their rows are dumped here with the relations that
 * give them meaning, so nothing is unrecoverable after the migration.
 *
 *   npx tsx scripts/export-retired-modules.ts
 *
 * Writes backups/retired-modules-<YYYY-MM-DD>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma, disconnect } from "./_client";

/** Decimal and Date don't survive JSON.stringify usefully — make them readable. */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    // Prisma Decimal instances expose toString(); plain objects don't.
    const maybeDecimal = value as { toFixed?: unknown; toString(): string };
    if (typeof maybeDecimal.toFixed === "function") return maybeDecimal.toString();
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

/**
 * Queries go through raw SQL rather than the Prisma models on purpose: after
 * this phase those models no longer exist in schema.prisma, and an archival
 * export tool should still run when pointed at a pre-v3 database.
 * Returns [] when the table is already gone, so re-running is harmless.
 */
async function dump(table: string, orderBy: string): Promise<unknown[]> {
  try {
    return await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${table}" ORDER BY ${orderBy}`,
    );
  } catch {
    console.log(`  (skipped "${table}" — table not present)`);
    return [];
  }
}

async function main() {
  console.log("Exporting retired modules…\n");

  const [quotations, quotationLineItems, rateCards, stakeholders, bookings] =
    await Promise.all([
      dump("quotations", '"createdAt" ASC'),
      dump("quotation_line_items", '"quotationId", "order" ASC'),
      dump("rate_cards", '"createdAt" ASC'),
      dump("stakeholders", '"createdAt" ASC'),
      dump("bookings", '"startAt" ASC'),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    reason: "V3 Phase 0 — retiring Quotations, Rate Cards, Stakeholders and Bookings",
    counts: {
      quotations: quotations.length,
      quotationLineItems: quotationLineItems.length,
      rateCards: rateCards.length,
      stakeholders: stakeholders.length,
      bookings: bookings.length,
    },
    quotations: serialize(quotations),
    quotationLineItems: serialize(quotationLineItems),
    rateCards: serialize(rateCards),
    stakeholders: serialize(stakeholders),
    bookings: serialize(bookings),
  };

  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(dir, `retired-modules-${date}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  console.table(payload.counts);
  console.log(`\nWrote ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(disconnect);
