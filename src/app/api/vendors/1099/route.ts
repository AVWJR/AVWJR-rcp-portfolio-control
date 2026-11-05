import { enforce, resolveActor, visibleEntityCodes } from "@/lib/auth/actor";
import { prisma } from "@/lib/prisma";
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
  const denied = await enforce("read");
  if (denied) return denied;
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const actor = await resolveActor();
  if (entityCode) {
    const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
    if (entity) {
      const scoped = await enforce("read", entity.id);
      if (scoped) return scoped;
    }
  }
  const exp = await load1099Export({ year, month, entityCode });
  const codes = await visibleEntityCodes(actor);
  if (codes) {
    exp.rows = exp.rows.filter((row) => codes.has(row.entityCode));
    exp.totalReportableCents = exp.rows.reduce((sum, row) => (row.reportable ? sum + row.amountCents : sum), 0n);
  }
  const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  return workbookResponse({
    sheets: form1099ToSheets(exp),
    format,
    filename: `${entityCode ?? "portfolio"}-${period}-1099-overlay`,
    json: serialize(exp),
  });
}
