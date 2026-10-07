import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/auth";
import { requireCapability } from "@/lib/api-permissions";
import { handleApiError } from "@/lib/api-errors";
import { CLIENT_IMPORT_COLUMNS } from "@/lib/client-import";

// GET /api/clients/import/template — download the .xlsx people fill in and
// upload back. One header row, one greyed example row they overwrite.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    requireCapability(user, "clients.manage");

    const headers = CLIENT_IMPORT_COLUMNS.map((c) => c.header);
    const example = CLIENT_IMPORT_COLUMNS.map((c) => c.example);

    // "Clients" sheet: header + one example row (the importer skips that example
    // if it's left untouched). People type their rows below it.
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(16, h.length + 4) }));

    // "Instructions" sheet: the rules travel with the file, out of the data.
    const guide: string[][] = [
      ["Column", "Required?", "Notes"],
      ...CLIENT_IMPORT_COLUMNS.map((c) => [
        c.header,
        c.required ? "Required" : "Optional",
        c.hint ?? "",
      ]),
      [],
      ["Fill one client per row under the headers on the Clients sheet.", "", ""],
      ["Delete or overwrite the grey example row.", "", ""],
      ["A client whose Company Name already exists is skipped, not duplicated.", "", ""],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guide);
    wsGuide["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.utils.book_append_sheet(wb, wsGuide, "Instructions");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="client-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/clients/import/template");
  }
}
