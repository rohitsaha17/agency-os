import { defineConfig } from "prisma/config";
import * as fs from "fs";
import * as path from "path";

// Manually load .env since prisma.config.ts runs outside Next.js env loading
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL!;

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    async adapter(env) {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
  datasource: {
    url: DATABASE_URL,
  },
});
