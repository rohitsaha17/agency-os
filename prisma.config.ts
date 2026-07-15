import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Load .env locally — silently no-op on hosted runners (Vercel/Railway)
// where env vars are injected directly and no .env file exists.
// Use process.cwd() rather than __dirname so the loader works under both
// CommonJS and ESM contexts (Prisma CLI may evaluate this either way).
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Prisma 7 requires `datasource.url` to be a literal in the exported
// config for migrate / db push. Making it conditional (only setting the
// property when DATABASE_URL is defined) makes `db push` error with
// "datasource.url property is required" instead of a clear connection
// error, so we always include it.
//
// Empty-string fallback: `prisma generate` doesn't need a real URL and
// won't crash on an empty one. Migrate/push commands with an empty URL
// will surface a clearer "invalid connection string" error downstream —
// pointing you at your DATABASE_URL env var, which is the actual problem.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
