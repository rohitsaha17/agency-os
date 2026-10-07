// Shared spec for the client bulk-import: the column list (used to build the
// downloadable template AND to parse an uploaded sheet), plus the row→input
// mapping and validation. Kept free of any spreadsheet library so it can be
// imported from either API route.

export interface ImportColumn {
  key: keyof ClientRowInput;
  header: string;
  required?: boolean;
  example: string;
  hint?: string;
}

export interface ClientRowInput {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  jobTitle: string;
  website: string;
  industry: string;
  address: string;
  notes: string;
  status: string;
  importance: string;
  currency: string;
}

/** The columns, in order, as they appear in the template's header row. */
export const CLIENT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "companyName", header: "Company Name", required: true, example: "Acme Studios" },
  { key: "contactName", header: "Primary Contact Name", required: true, example: "Priya Sharma" },
  { key: "email", header: "Contact Email", example: "priya@acme.com" },
  { key: "phone", header: "Contact Phone", example: "+91 98765 43210" },
  { key: "jobTitle", header: "Contact Role", example: "Marketing Lead" },
  { key: "website", header: "Website", example: "https://acme.com" },
  { key: "industry", header: "Industry", example: "E-commerce" },
  { key: "address", header: "Address", example: "Mumbai, India" },
  { key: "notes", header: "Notes", example: "Referred by existing client" },
  { key: "status", header: "Status", example: "Active", hint: "Active, Prospect, Inactive or Archived" },
  { key: "importance", header: "Importance", example: "Normal", hint: "Normal, Important or VIP" },
  { key: "currency", header: "Currency", example: "INR", hint: "3-letter code; blank = workspace default" },
];

type ClientStatus = "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
type ClientImportance = "NORMAL" | "IMPORTANT" | "VIP";

export function normalizeStatus(raw: string): ClientStatus {
  const v = raw.trim().toUpperCase();
  if (v === "PROSPECT" || v === "INACTIVE" || v === "ARCHIVED" || v === "ACTIVE") return v;
  return "ACTIVE";
}

export function normalizeImportance(raw: string): ClientImportance {
  const v = raw.trim().toUpperCase();
  if (v === "IMPORTANT" || v === "VIP" || v === "NORMAL") return v;
  return "NORMAL";
}

export interface ParsedClient {
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  notes: string | null;
  status: ClientStatus;
  importance: ClientImportance;
  currency: string | null;
}

/**
 * Turn one raw sheet row (header → cell value, any casing) into a validated
 * client input, or an error message. Header matching is case/space-insensitive
 * so "company name", "Company Name" and "COMPANY_NAME" all work.
 */
export function rowToClient(raw: Record<string, unknown>):
  { ok: true; value: ParsedClient } | { ok: false; error: string } {
  // Normalize the row's keys once.
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const byKey = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    byKey.set(norm(k), v == null ? "" : String(v).trim());
  }
  const get = (header: string) => byKey.get(norm(header)) ?? "";

  const companyName = get("Company Name");
  const contactName = get("Primary Contact Name");
  if (!companyName) return { ok: false, error: "Company Name is required" };
  if (!contactName) return { ok: false, error: "Primary Contact Name is required" };

  const str = (h: string) => { const v = get(h); return v || null; };

  return {
    ok: true,
    value: {
      companyName,
      contactName,
      email: str("Contact Email"),
      phone: str("Contact Phone"),
      jobTitle: str("Contact Role"),
      website: str("Website"),
      industry: str("Industry"),
      address: str("Address"),
      notes: str("Notes"),
      status: normalizeStatus(get("Status")),
      importance: normalizeImportance(get("Importance")),
      currency: (get("Currency") || "").trim() || null,
    },
  };
}
