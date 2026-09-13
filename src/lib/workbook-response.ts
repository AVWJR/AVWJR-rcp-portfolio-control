import { sheetsToExcelXml, sheetToCsv, type WorkbookSheet } from "@rcp/tax-bridge";
import { NextResponse } from "next/server";

export function workbookResponse(opts: {
  sheets: WorkbookSheet[];
  format: string;
  filename: string;
  json: unknown;
}) {
  if (opts.format === "json") {
    return NextResponse.json(opts.json);
  }
  if (opts.format === "csv") {
    const csv = sheetToCsv(opts.sheets[0]!);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${opts.filename}.csv"`,
      },
    });
  }
  if (opts.format === "xls" || opts.format === "xlsx") {
    const xml = sheetsToExcelXml(opts.sheets);
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="${opts.filename}.xls"`,
      },
    });
  }
  return NextResponse.json({ error: "format must be json, csv, or xls" }, { status: 400 });
}
