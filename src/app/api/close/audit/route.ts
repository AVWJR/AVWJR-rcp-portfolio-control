import { enforce } from "@/lib/auth/actor";
import { closeAuditCsv } from "@/lib/close/audit-export";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await enforce("read");
  if (denied) return denied;
  const url = new URL(request.url);
  const code = (url.searchParams.get("entity") ?? "").trim().toUpperCase();
  const period = url.searchParams.get("period") ?? "";
  const [year, month] = period.split("-").map(Number);
  if (!code || !year || !month) {
    return NextResponse.json({ error: "Pick an entity and a period." }, { status: 400 });
  }
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const scoped = await enforce("read", entity.id);
  if (scoped) return scoped;
  const csv = await closeAuditCsv(code, year, month);
  if (!csv) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${code}-${period}-close-audit.csv"`,
    },
  });
}
