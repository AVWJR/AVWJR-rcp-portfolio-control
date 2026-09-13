import { loadCapitalRollforward } from "@/lib/capital";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { workbookResponse } from "@/lib/workbook-response";
import { capitalToSheets } from "@rcp/tax-bridge";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "SPE-WBG";
  const period = url.searchParams.get("period") ?? "2026-08";
  const format = url.searchParams.get("format") ?? "json";
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const roll = await loadCapitalRollforward({ entityId: entity.id, year, month });
  return workbookResponse({
    sheets: capitalToSheets(roll),
    format,
    filename: `${entity.code}-${period}-k1-capital`,
    json: serialize(roll),
  });
}
