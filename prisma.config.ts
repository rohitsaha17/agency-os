import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Load .env locally — silently no-op on hosted runners (Vercel/Railway)
// where env vars are injected directly and no .env file exists.
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Use process.env directly so a missing DATABASE_URL doesn't throw at
// config-load time (which would break `prisma generate` during install
// on Vercel before runtime env vars are wired up). Migrate commands
// will surface a clearer error later if the URL is actually needed.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    datasourceUrl: process.env.DATABASE_URL ?? "",
  },
} as Parameters<typeof defineConfig>[0]);
