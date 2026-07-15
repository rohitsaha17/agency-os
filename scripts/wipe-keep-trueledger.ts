/**
 * Wipe all data from the database EXCEPT the "Trueledger" client.
 *
 * Run with:
 *   npx tsx scripts/wipe-keep-trueledger.ts
 *
 * Strategy:
 *   1. Find Trueledger and snapshot it (client + primary contact).
 *   2. TRUNCATE every table CASCADE.
 *   3. Re-insert the Trueledger client (and primary contact).
 *
 * This sidesteps any partial / missing ON DELETE CASCADE in the schema and
 * leaves you with a clean DB containing only Trueledger.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("→ Snapshotting Trueledger…");
  const trueledger = await prisma.client.findFirst({
    where: {
      OR: [
        { companyName: { contains: "trueledger", mode: "insensitive" } },
        { name: { contains: "trueledger", mode: "insensitive" } },
      ],
    },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
    },
  });

  if (trueledger) {
    console.log(`  Snapshot ok — ${trueledger.id} / ${trueledger.companyName ?? trueledger.name}`);
  } else {
    console.warn("  No existing Trueledger — will create a fresh one after wipe");
  }

  // ── List all tables in public schema, then TRUNCATE them all ───
  console.log("→ Listing tables…");
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma_%'
  `;
  const tables = rows.map((r) => r.tablename).filter(Boolean);
  console.log(`  Found ${tables.length} tables: ${tables.join(", ")}`);

  if (tables.length === 0) {
    throw new Error("No tables to truncate — schema not migrated?");
  }

  console.log("→ TRUNCATE CASCADE all tables…");
  const quoted = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log("  ✓ wiped");

  // ── Restore Trueledger ─────────────────────────────────────────
  console.log("→ Restoring Trueledger…");
  const company = trueledger?.companyName ?? trueledger?.name ?? "Trueledger";
  const primary = trueledger?.contacts?.[0];

  const restored = await prisma.client.create({
    data: {
      name: company,
      companyName: company,
      email: trueledger?.email ?? null,
      phone: trueledger?.phone ?? null,
      website: trueledger?.website ?? null,
      industry: trueledger?.industry ?? null,
      address: trueledger?.address ?? null,
      logoUrl: trueledger?.logoUrl ?? null,
      links: trueledger?.links ?? undefined,
      brandColors: trueledger?.brandColors ?? undefined,
      brandAssets: trueledger?.brandAssets ?? undefined,
      taxRegistrations: trueledger?.taxRegistrations ?? undefined,
      notes: trueledger?.notes ?? null,
      status: trueledger?.status ?? "ACTIVE",
      contacts: {
        create: {
          name: primary?.name ?? "Primary Contact",
          email: primary?.email ?? null,
          phone: primary?.phone ?? null,
          jobTitle: primary?.jobTitle ?? null,
          isPrimary: true,
        },
      },
    },
  });

  console.log(`  ✓ Trueledger restored — ${restored.id}`);
  console.log("✓ Done.");
}

main()
  .catch((e) => {
    console.error("✗ Wipe failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
