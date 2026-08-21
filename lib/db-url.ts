/**
 * Resolve the Postgres connection URL. DATABASE_URL, and nothing else.
 *
 * This used to fall through a chain — DATABASE_URL, then POSTGRES_PRISMA_URL,
 * then POSTGRES_URL, then POSTGRES_URL_NON_POOLING — so the app would start
 * whichever of them happened to be present.
 *
 * That cost a production outage. The Supabase-Vercel integration injects those
 * POSTGRES_* names automatically and stamps them with the database password AS
 * IT WAS when the integration was connected. Reset the password and they go
 * stale, but they don't disappear. So a deployment whose DATABASE_URL was
 * missing or scoped to the wrong environment didn't fail with "DATABASE_URL is
 * not set" — it quietly connected with an old credential and returned
 * PrismaClientKnownRequestError P1000 from inside a route handler, three steps
 * away from the actual mistake. The same chain also explains an earlier P1001:
 * POSTGRES_URL_NON_POOLING points at Supabase's direct host, which resolves to
 * IPv6 only and is unreachable from Vercel's IPv4 functions.
 *
 * A fallback that silently picks a different credential isn't resilience. One
 * variable, and a clear error naming it when it's absent.
 */

function read(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

/** The names this app deliberately ignores, and why the message says so. */
const IGNORED = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

function resolve(purpose: string): string {
  const url = read("DATABASE_URL");
  if (url) return url;

  // Name the trap explicitly. Someone hitting this has very likely got a
  // POSTGRES_* variable sitting there looking like it should work.
  const present = IGNORED.filter((n) => read(n));
  const note = present.length
    ? ` ${present.join(", ")} ${present.length === 1 ? "is" : "are"} set, but `
      + "deliberately ignored: those are injected by the Supabase-Vercel "
      + "integration and carry whatever password was current when it was "
      + "connected, which goes stale on a password reset."
    : "";

  throw new Error(
    `DATABASE_URL is not set, so ${purpose} cannot connect.${note} `
    + "Set DATABASE_URL on this environment (in Vercel, check the Production "
    + "box specifically) and redeploy.",
  );
}

/** URL for regular runtime PrismaClient queries. */
export function getRuntimeDatabaseUrl(): string {
  return resolve("the app");
}

/** URL for schema migrations / `prisma db push`. */
export function getMigrationDatabaseUrl(): string {
  return resolve("migrations");
}
