import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const updated = await prisma.client.updateMany({
    where: { OR: [
      { companyName: { contains: "trueledger", mode: "insensitive" } },
      { name: { contains: "trueledger", mode: "insensitive" } },
    ]},
    data: { status: "ACTIVE" },
  });
  console.log("Updated", updated.count, "Trueledger record(s) to ACTIVE");
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end(); });
