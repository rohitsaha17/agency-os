/**
 * Wipe ALL data and seed a fresh workspace with:
 *   - Client "Gloo" (with Anshul Sarawgi as primary contact)
 *   - User  "Anshul Sarawgi" as ADMIN (super admin)
 *
 * Run with:
 *   npx tsx scripts/wipe-and-seed-gloo.ts
 *
 * TRUNCATE CASCADE is used to sidestep any partial ON DELETE CASCADE
 * settings in the schema. This nukes every row and resets identity
 * sequences.
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
  console.log("  ✓ wiped clean");

  // ── Seed: user (Anshul Sarawgi, ADMIN) ──────────────────────────
  console.log("→ Creating Anshul Sarawgi (ADMIN)…");
  const anshul = await prisma.user.create({
    data: {
      email: "anshul@gloo.in",
      name: "Anshul Sarawgi",
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log(`  ✓ user ${anshul.id} — ${anshul.email}`);

  // ── Seed: client Gloo with Anshul as primary contact ────────────
  console.log("→ Creating Gloo client…");
  const gloo = await prisma.client.create({
    data: {
      name: "Gloo",
      companyName: "Gloo",
      status: "ACTIVE",
      contacts: {
        create: {
          name: "Anshul Sarawgi",
          email: "anshul@gloo.in",
          isPrimary: true,
        },
      },
    },
    include: { contacts: true },
  });
  console.log(`  ✓ client ${gloo.id} — ${gloo.companyName}`);
  console.log(`    primary contact: ${gloo.contacts[0]?.name}`);

  console.log("✓ Done. Workspace has 1 user + 1 client.");
}

main()
  .catch((e) => {
    console.error("✗ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
