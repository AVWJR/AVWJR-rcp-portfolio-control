import { serialize } from "@/lib/serialize";
import { load1099Export } from "@/lib/vendors";
import { workbookResponse } from "@/lib/workbook-response";
import { form1099ToSheets } from "@rcp/tax-bridge";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") ?? "2026");
  const monthRaw = url.searchParams.get("month");
  const month = monthRaw ? Number(monthRaw) : undefined;
  const entityCode = url.searchParams.get("entity") ?? undefined;
  const format = url.searchParams.get("format") ?? "json";
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const exp = await load1099Export({ year, month, entityCode });
  const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  return workbookResponse({
    sheets: form1099ToSheets(exp),
    format,
    filename: `${entityCode ?? "portfolio"}-${period}-1099-overlay`,
    json: serialize(exp),
  });
}
