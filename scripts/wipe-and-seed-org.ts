/**
 * Wipe ALL data and seed a fresh multi-tenant workspace:
 *   - Organization "My Agency" (rename later via Settings → Organization)
 *   - User "Anshul Sarawgi" as OWNER of that organization
 *
 * No clients, no projects, no anything else. Anshul owns the whole agency.
 *
 *   npx tsx scripts/wipe-and-seed-org.ts
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
  console.log("→ Wiping all tables…");
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma_%'
  `;
  const tables = rows.map((r) => r.tablename).filter(Boolean);
  const quoted = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log(`  ✓ wiped ${tables.length} tables`);

  console.log("→ Creating Organization…");
  const org = await prisma.organization.create({
    data: {
      name: "My Agency",
      currency: "USD",
      timezone: "UTC",
      letterheadTemplate: "CLASSIC",
      letterheadColor: "#6366f1",
    },
  });
  console.log(`  ✓ organization ${org.id} — "${org.name}"`);
  console.log("    (rename this + configure logo/address via Settings → Organization)");

  console.log("→ Creating Anshul Sarawgi as OWNER…");
  const anshul = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "anshul@myagency.com",
      name: "Anshul Sarawgi",
      role: "OWNER",
      isActive: true,
    },
  });
  console.log(`  ✓ user ${anshul.id} — ${anshul.email} (${anshul.role})`);

  console.log("\n✓ Done. Fresh multi-tenant workspace:");
  console.log(`  • Organization: ${org.name} (${org.id})`);
  console.log(`  • Owner:        ${anshul.name} (${anshul.email})`);
  console.log("  • Clients / projects / etc.: 0");
}

main()
  .catch((e) => { console.error("✗ Failed:", e); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
