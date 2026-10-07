import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { rowToClient, CLIENT_IMPORT_COLUMNS } from "@/lib/client-import";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 1000;

const EXAMPLE_COMPANY = (CLIENT_IMPORT_COLUMNS.find((c) => c.key === "companyName")?.example ?? "").toLowerCase();
const EXAMPLE_CONTACT = (CLIENT_IMPORT_COLUMNS.find((c) => c.key === "contactName")?.example ?? "").toLowerCase();

// POST /api/clients/import — multipart upload of the filled template.
// Creates one client (+ its primary contact) per valid row and returns a
// per-row report so nothing fails silently.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "clients.manage");

    const rl = checkRateLimit(req, `clients:import:${user.id}`, WRITE_RATE_LIMITS.heavy);
    if (!rl.allowed) return apiError("Too many imports, please wait a moment", 429);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("No file uploaded", 400);
    if (file.size > MAX_BYTES) return apiError("File is too large (max 5 MB)", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      // Prefer a sheet literally named "Clients"; else the first sheet.
      const sheetName = wb.SheetNames.includes("Clients") ? "Clients" : wb.SheetNames[0];
      const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
      if (!sheet) return apiError("The file has no sheets", 400);
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    } catch {
      return apiError("Could not read that file — upload the .xlsx or .csv template", 400);
    }

    if (rows.length > MAX_ROWS) {
      return apiError(`Too many rows (${rows.length}). Import up to ${MAX_ROWS} at a time.`, 400);
    }

    // Existing company names in this org, lower-cased, so re-imports don't
    // duplicate. (Client.name holds the company name — see POST /api/clients.)
    const existing = await prisma.client.findMany({
      where: { organizationId: user.organizationId },
      select: { name: true },
    });
    const have = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    // Also guard against duplicates WITHIN the uploaded file.
    const seenInFile = new Set<string>();

    const errors: { row: number; company: string; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const fileRow = i + 2; // header is row 1, so data starts at row 2
      const raw = rows[i];

      // Skip blank rows (every cell empty).
      const anyValue = Object.values(raw).some((v) => String(v ?? "").trim() !== "");
      if (!anyValue) continue;

      const parsed = rowToClient(raw);
      if (!parsed.ok) {
        errors.push({ row: fileRow, company: String(raw["Company Name"] ?? ""), message: parsed.error });
        continue;
      }
      const c = parsed.value;
      const key = c.companyName.toLowerCase();

      // The untouched template example — ignore it rather than importing "Acme".
      if (key === EXAMPLE_COMPANY && c.contactName.toLowerCase() === EXAMPLE_CONTACT) continue;

      if (have.has(key) || seenInFile.has(key)) {
        skipped++;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const client = await tx.client.create({
            data: {
              organizationId: user.organizationId,
              name: c.companyName,
              companyName: c.companyName,
              email: c.email,
              phone: c.phone,
              website: c.website,
              industry: c.industry,
              address: c.address,
              notes: c.notes,
              status: c.status,
              importance: c.importance,
              currency: c.currency,
            },
          });
          await tx.clientContact.create({
            data: {
              clientId: client.id,
              name: c.contactName,
              email: c.email,
              phone: c.phone,
              jobTitle: c.jobTitle,
              isPrimary: true,
            },
          });
        });
        have.add(key);
        seenInFile.add(key);
        created++;
      } catch (err) {
        console.error("[clients/import] row failed:", err);
        errors.push({ row: fileRow, company: c.companyName, message: "Could not be saved" });
      }
    }

    return NextResponse.json({ created, skipped, errors, total: rows.length });
  } catch (error) {
    return handleApiError(error, "POST /api/clients/import");
  }
}
