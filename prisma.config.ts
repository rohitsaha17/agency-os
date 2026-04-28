import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Load .env locally — silently no-op on hosted runners (Vercel/Railway)
// where env vars are injected directly and no .env file exists.
dotenv.config({ path: path.resolve(__dirname, ".env") });

const databaseUrl = process.env.DATABASE_URL;

// Only declare the migrate datasourceUrl when DATABASE_URL is actually
// set. Including it as an empty string makes Prisma 7 treat the property
// as "missing" and reject `db push` / `migrate`. Omitting it entirely
// when unset lets `prisma generate` run during `npm install` (when env
// vars may not yet be wired up), while still giving migrate commands a
// real URL at build/runtime when the env var IS set.
const config: Parameters<typeof defineConfig>[0] = {
  schema: "prisma/schema.prisma",
};

if (databaseUrl) {
  config.migrate = { datasourceUrl: databaseUrl };
}

export default defineConfig(config);
