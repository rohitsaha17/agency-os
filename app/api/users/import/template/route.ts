import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { TEAM_IMPORT_COLUMNS } from "@/lib/team-import";

// GET /api/users/import/template — download the .xlsx people fill in to invite
// a batch of teammates.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "users.manage");

    const headers = TEAM_IMPORT_COLUMNS.map((c) => c.header);
    const example = TEAM_IMPORT_COLUMNS.map((c) => c.example);

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(18, h.length + 6) }));

    const guide: string[][] = [
      ["Column", "Required?", "Notes"],
      ...TEAM_IMPORT_COLUMNS.map((c) => [
        c.header,
        c.required ? "Required" : "Optional",
        c.hint ?? "",
      ]),
      [],
      ["One teammate per row under the headers on the Team sheet.", "", ""],
      ["Delete or overwrite the grey example row.", "", ""],
      ["Each new teammate gets an invite link to share with them — it's shown after import.", "", ""],
      ["An email that already belongs to a teammate is skipped, not duplicated.", "", ""],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guide);
    wsGuide["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 64 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Team");
    XLSX.utils.book_append_sheet(wb, wsGuide, "Instructions");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="team-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/users/import/template");
  }
}
