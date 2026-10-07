// Shared spec for the team-member (People) bulk import — column list used by
// both the template and the parser, plus row→input mapping and validation.
// No spreadsheet library imported here, so it's safe to use from either route.
//
// Importing a team member creates a login account, so each created user gets a
// single-use setup link (the same QA-001 flow a single invite uses); the API
// returns those links for the admin to share.

export interface TeamImportColumn {
  key: "name" | "email" | "role" | "jobTitle";
  header: string;
  required?: boolean;
  example: string;
  hint?: string;
}

export const TEAM_IMPORT_COLUMNS: TeamImportColumn[] = [
  { key: "name", header: "Name", required: true, example: "Priya Sharma" },
  { key: "email", header: "Email", required: true, example: "priya@youragency.com" },
  { key: "role", header: "Access Level", example: "Team", hint: "Team, SMM, Manager or Admin (blank = Team)" },
  { key: "jobTitle", header: "Job Title", example: "Social Media Manager", hint: "Optional; must match a job title already set up in your workspace" },
];

export type AssignableRole = "ADMIN" | "MANAGER" | "SMM" | "TEAM";

/** Friendly spreadsheet value → role enum. Unknown/blank → TEAM. */
export function normalizeRole(raw: string): AssignableRole {
  const v = raw.trim().toUpperCase();
  if (v === "ADMIN") return "ADMIN";
  if (v === "MANAGER") return "MANAGER";
  if (v === "SMM") return "SMM";
  return "TEAM";
}

// Lenient — just enough to reject obvious junk, not to enforce RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedMember {
  name: string;
  email: string;
  role: AssignableRole;
  jobTitle: string; // designation NAME; the route resolves it to an id
}

export function rowToMember(raw: Record<string, unknown>):
  { ok: true; value: ParsedMember } | { ok: false; error: string } {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const byKey = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    byKey.set(norm(k), v == null ? "" : String(v).trim());
  }
  const get = (header: string) => byKey.get(norm(header)) ?? "";

  const name = get("Name");
  const email = get("Email").toLowerCase();
  if (!name) return { ok: false, error: "Name is required" };
  if (!email) return { ok: false, error: "Email is required" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Email looks invalid" };

  return {
    ok: true,
    value: {
      name,
      email,
      role: normalizeRole(get("Access Level")),
      jobTitle: get("Job Title"),
    },
  };
}
