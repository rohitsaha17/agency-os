import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getRuntimeDatabaseUrl } from "@/lib/db-url";

// Prevent multiple Prisma Client instances during Next.js hot reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // Accept whichever connection URL is present — DATABASE_URL, or the
  // Vercel-Supabase auto-injected POSTGRES_* variants.
  const pool = new Pool({ connectionString: getRuntimeDatabaseUrl() });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
