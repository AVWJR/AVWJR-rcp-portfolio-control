import { workbookResponse } from "@/lib/workbook-response";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { loadBooksToTaxWorksheet } from "@/lib/tax-bridge";
import { worksheetToSheets } from "@rcp/tax-bridge";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "SPE-WBG";
  const period = url.searchParams.get("period") ?? "2026-08";
  const format = url.searchParams.get("format") ?? "json";
  const view = url.searchParams.get("view");
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const ws = await loadBooksToTaxWorksheet({
    entityId: entity.id,
    year,
    month,
    consolidated: view === "combined" || view === "consolidated",
  });
  return workbookResponse({
    sheets: worksheetToSheets(ws),
    format,
    filename: `${entity.code}-${period}-books-to-tax`,
    json: serialize(ws),
  });
}
