import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { apiError, handleApiError } from "@/lib/api-errors";
import { checkRateLimit, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { mintSetupToken } from "@/lib/setup-token";
import { rowToMember, TEAM_IMPORT_COLUMNS } from "@/lib/team-import";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 200; // each row creates a login account — keep batches sane

const EXAMPLE_EMAIL = (TEAM_IMPORT_COLUMNS.find((c) => c.key === "email")?.example ?? "").toLowerCase();

// POST /api/users/import — multipart upload of the filled team template.
// Creates one user per valid row (same single-use setup-token invite as adding
// one teammate), and returns each new person's invite link to share.
export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    requireCapability(caller, "users.manage");

    const rl = checkRateLimit(req, `users:import:${caller.id}`, WRITE_RATE_LIMITS.heavy);
    if (!rl.allowed) return apiError("Too many imports, please wait a moment", 429);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("No file uploaded", 400);
    if (file.size > MAX_BYTES) return apiError("File is too large (max 5 MB)", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames.includes("Team") ? "Team" : wb.SheetNames[0];
      const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
      if (!sheet) return apiError("The file has no sheets", 400);
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    } catch {
      return apiError("Could not read that file — upload the .xlsx or .csv template", 400);
    }

    if (rows.length > MAX_ROWS) {
      return apiError(`Too many rows (${rows.length}). Invite up to ${MAX_ROWS} at a time.`, 400);
    }

    // Existing emails (dedup), and job titles (match by name → id).
    const [existing, designations] = await Promise.all([
      prisma.user.findMany({ where: { organizationId: caller.organizationId }, select: { email: true } }),
      prisma.designationRole.findMany({ where: { organizationId: caller.organizationId }, select: { id: true, name: true } }),
    ]);
    const have = new Set(existing.map((u) => u.email.toLowerCase()));
    const seenInFile = new Set<string>();
    const designationByName = new Map(designations.map((d) => [d.name.trim().toLowerCase(), d.id]));

    const canGrantAdmin = caller.role === "ADMIN" || caller.role === "OWNER";

    const created: { name: string; email: string; role: string; setupPath: string }[] = [];
    const errors: { row: number; email: string; message: string }[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const fileRow = i + 2;
      const raw = rows[i];

      const anyValue = Object.values(raw).some((v) => String(v ?? "").trim() !== "");
      if (!anyValue) continue;

      const parsed = rowToMember(raw);
      if (!parsed.ok) {
        errors.push({ row: fileRow, email: String(raw["Email"] ?? ""), message: parsed.error });
        continue;
      }
      const m = parsed.value;

      // The untouched template example.
      if (m.email === EXAMPLE_EMAIL) continue;

      if (have.has(m.email) || seenInFile.has(m.email)) { skipped++; continue; }

      // Only an admin/owner can mint an admin — flag the row rather than failing
      // the whole import.
      if (m.role === "ADMIN" && !canGrantAdmin) {
        errors.push({ row: fileRow, email: m.email, message: "Only an admin can grant the Admin role" });
        continue;
      }

      const designationId = m.jobTitle ? (designationByName.get(m.jobTitle.toLowerCase()) ?? null) : null;
      if (m.jobTitle && !designationId) {
        errors.push({ row: fileRow, email: m.email, message: `Job title "${m.jobTitle}" isn't set up in your workspace` });
        continue;
      }

      try {
        const setup = mintSetupToken();
        await prisma.user.create({
          data: {
            organizationId: caller.organizationId,
            name: m.name,
            email: m.email,
            role: m.role,
            designationId,
            setupTokenHash: setup.hash,
            setupTokenExpiresAt: setup.expiresAt,
          },
        });
        have.add(m.email);
        seenInFile.add(m.email);
        created.push({
          name: m.name,
          email: m.email,
          role: m.role,
          setupPath: `/set-password?token=${encodeURIComponent(setup.token)}`,
        });
      } catch (err) {
        console.error("[users/import] row failed:", err);
        errors.push({ row: fileRow, email: m.email, message: "Could not be saved" });
      }
    }

    return NextResponse.json({ created, skipped, errors, total: rows.length });
  } catch (error) {
    return handleApiError(error, "POST /api/users/import");
  }
}
