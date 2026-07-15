import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Load .env locally — silently no-op on hosted runners (Vercel/Railway)
// where env vars are injected directly and no .env file exists.
// Use process.cwd() rather than __dirname so the loader works under both
// CommonJS and ESM contexts (Prisma CLI may evaluate this either way).
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const databaseUrl = process.env.DATABASE_URL;

// Prisma 7 expects the connection URL under `datasource.url` (not under
// `migrate.*` — that field doesn't exist in the public PrismaConfig type).
// The property must always be present; we use an empty-string fallback so
// `prisma generate` during install (e.g. Vercel before env vars wire up)
// doesn't crash. Migrate commands will surface a clear connection error
// downstream if the URL is empty, which is the desired behavior.
const config: Parameters<typeof defineConfig>[0] = {
  schema: "prisma/schema.prisma",
};
if (databaseUrl) {
  config.datasource = { url: databaseUrl };
}

export default defineConfig(config);
